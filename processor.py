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
            
        # Optimization: Process every 3rd frame to speed up (3x faster)
        # Using imgsz=320 speeds up YOLO inference significantly
        if frame_num % 3 == 0:
            results = model.predict(frame, classes=[32], verbose=False, imgsz=320)
            
            # Find the most confident ball
            best_conf = 0.25  # Minimum confidence threshold
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
    
    # Analyze trajectory to find "shots" (parabolic arcs)
    # A simple peak detection in Y coordinate (smaller Y = higher on screen)
    # We look for a sequence where Y decreases (ball goes up) then increases (ball goes down)
    shots_frames = []
    
    if len(ball_positions) > 5:
        y_vals = [p[2] for p in ball_positions]
        f_nums = [p[0] for p in ball_positions]
        
        # Check for local minimum in Y (which means highest point physically)
        for i in range(2, len(y_vals) - 2):
            if y_vals[i] < y_vals[i-1] and y_vals[i] < y_vals[i-2] and \
               y_vals[i] < y_vals[i+1] and y_vals[i] < y_vals[i+2]:
                
                peak_frame = f_nums[i]
                
                # Check if it's far enough from previous shot (at least 3 seconds gap to avoid duplicates)
                if not shots_frames or (peak_frame - shots_frames[-1]) > (fps * 3):
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
