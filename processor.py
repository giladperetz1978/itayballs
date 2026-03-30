import cv2
import numpy as np
from ultralytics import YOLO
import os

try:
    from moviepy import VideoFileClip, concatenate_videoclips
except ImportError:
    from moviepy.editor import VideoFileClip, concatenate_videoclips


def _make_subclip(clip, start_time, end_time):
    # Keep compatibility across MoviePy versions.
    if hasattr(clip, "subclip"):
        return clip.subclip(start_time, end_time)
    return clip.subclipped(start_time, end_time)

def process_video(video_path, output_path, progress_callback=None):
    frame_stride = 2
    min_shot_gap_seconds = 0.7
    min_confidence = 0.12

    # Load YOLOv8 model (yolov8n.pt will be downloaded automatically)
    model = YOLO('yolov8n.pt')
    
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps == 0 or np.isnan(fps):
        fps = 30.0
    
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    # Store ball positions: [(frame_num, x, y), ...]
    ball_positions = []
    
    frame_num = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
            
        # Optimization: Process every Nth frame to speed up inference.
        # Using imgsz=320 speeds up YOLO inference significantly
        if frame_num % frame_stride == 0:
            results = model.predict(frame, classes=[32], verbose=False, imgsz=320)
            
            # Find the most confident ball
            best_conf = min_confidence
            best_box = None
            for result in results:
                boxes = result.boxes
                for box in boxes:
                    conf = float(box.conf[0])
                    if conf > best_conf:
                        best_conf = conf
                        best_box = box.xywh[0].cpu().numpy() # [x_center, y_center, width, height]
                        
            if best_box is not None:
                x, y, w, h = best_box
                ball_positions.append((frame_num, x, y))
            
        frame_num += 1
        if progress_callback and frame_num % 10 == 0:
            progress_callback(frame_num / max(1, total_frames) * 0.5) # First 50% is tracking
            
    cap.release()
    
    # Analyze trajectory to find "shots" (parabolic arcs).
    # Smaller Y means higher on screen.
    shots_frames = []
    
    if len(ball_positions) > 5:
        y_vals = np.array([p[2] for p in ball_positions], dtype=np.float32)
        f_nums = np.array([p[0] for p in ball_positions], dtype=np.int32)

        # Smooth noisy detections to make arc peaks easier to detect.
        smooth_y = y_vals.copy()
        if len(y_vals) >= 5:
            kernel = np.ones(5, dtype=np.float32) / 5.0
            smooth_y = np.convolve(y_vals, kernel, mode="same")

        min_gap_frames = fps * min_shot_gap_seconds
        local_window = 4
        min_prominence_px = 7.0

        def detect_candidates(prominence_threshold):
            candidates = []
            for i in range(local_window, len(smooth_y) - local_window):
                center = smooth_y[i]
                left = smooth_y[i - local_window:i]
                right = smooth_y[i + 1:i + 1 + local_window]

                # Center should be a local minimum (ball apex).
                if center > np.min(left) or center > np.min(right):
                    continue

                left_prom = float(np.max(left) - center)
                right_prom = float(np.max(right) - center)
                if left_prom < prominence_threshold or right_prom < prominence_threshold:
                    continue

                # Also require velocity sign change around apex.
                dy_prev = center - smooth_y[i - 1]
                dy_next = smooth_y[i + 1] - center
                if dy_prev >= -0.2 or dy_next <= 0.2:
                    continue

                candidates.append(int(f_nums[i]))
            return candidates

        primary_candidates = detect_candidates(min_prominence_px)
        relaxed_candidates = primary_candidates if primary_candidates else detect_candidates(3.0)

        for peak_frame in relaxed_candidates:
            if not shots_frames or (peak_frame - shots_frames[-1]) > min_gap_frames:
                shots_frames.append(peak_frame)

        # Fallback 1: legacy monotonic apex rule (the earlier behavior that at least caught events).
        if not shots_frames:
            for i in range(2, len(y_vals) - 2):
                moving_up = y_vals[i-2] >= y_vals[i-1] >= y_vals[i]
                moving_down = y_vals[i] <= y_vals[i+1] <= y_vals[i+2]
                if moving_up and moving_down:
                    peak_frame = int(f_nums[i])
                    if not shots_frames or (peak_frame - shots_frames[-1]) > min_gap_frames:
                        shots_frames.append(peak_frame)

        # Fallback 2: ultra-relaxed local minima to avoid zero-output runs.
        if not shots_frames:
            relaxed_gap_frames = fps * 0.45
            for i in range(1, len(y_vals) - 1):
                if y_vals[i] <= y_vals[i - 1] and y_vals[i] <= y_vals[i + 1]:
                    peak_frame = int(f_nums[i])
                    if not shots_frames or (peak_frame - shots_frames[-1]) > relaxed_gap_frames:
                        shots_frames.append(peak_frame)
    
    if not shots_frames:
        return False, "לא זוהו מופעי קליעה (תנועה פרבולית) בסרטון."
        
    # Extract subclips: 1.5 seconds before peak, 1.5 seconds after
    clip = VideoFileClip(video_path)
    subclips = []
    
    for i, peak_frame in enumerate(shots_frames):
        peak_time = peak_frame / fps
        start_time = max(0, peak_time - 1.5)
        end_time = min(clip.duration, peak_time + 1.5)
        
        try:
            subclip = _make_subclip(clip, start_time, end_time)
            subclips.append(subclip)
        except Exception as e:
            print(f"Error extracting subclip: {e}")
            
        if progress_callback:
            # Second 50% is clip extraction and assembly
            progress_callback(0.5 + 0.4 * (i / len(shots_frames)))
            
    if not subclips:
        clip.close()
        return False, "הייתה שגיאה ביצירת המקטעים."
        
    # Concatenate
    try:
        final_clip = concatenate_videoclips(subclips)
        final_clip.write_videofile(output_path, codec="libx264", audio_codec="aac")
        
        if progress_callback:
            progress_callback(1.0)
            
        final_clip.close()
    except Exception as e:
        return False, f"שגיאה בחיבור הוידאו: {str(e)}"
    finally:
        for c in subclips:
            c.close()
        clip.close()
        
    return True, "הוידאו נוצר בהצלחה!"
