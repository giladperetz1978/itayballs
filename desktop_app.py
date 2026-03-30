import os
import queue
import tempfile
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

import cv2
from PIL import Image, ImageTk

from processor import process_video


class HighlightsDesktopApp:
    def __init__(self, root):
        self.root = root
        self.root.title("האפליקציה של איתי האלוף")
        self.root.geometry("920x680")
        self.root.minsize(840, 620)
        self.root.configure(bg="#0f1720")

        self.input_path = tk.StringVar()
        self.output_path = tk.StringVar()
        self.status_text = tk.StringVar(value="בחר וידאו כדי להתחיל.")
        self.progress_value = tk.DoubleVar(value=0)
        self.queue = queue.Queue()
        self.processing = False
        self.preview_image = None
        self.preview_photo = None
        self.hero_canvas = None
        self.hero_ball = None
        self.hero_ball_phase = 0
        self.meta_vars = {
            "name": tk.StringVar(value="עדיין לא נבחר וידאו"),
            "duration": tk.StringVar(value="--"),
            "resolution": tk.StringVar(value="--"),
            "size": tk.StringVar(value="--"),
        }

        self._build_ui()
        self._poll_queue()
        self._animate_hero_ball()

    def _build_ui(self):
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("Main.TFrame", background="#0f1720")
        style.configure("Card.TFrame", background="#13212e")
        style.configure("Header.TLabel", background="#13212e", foreground="#f3f7fb", font=("Segoe UI", 22, "bold"))
        style.configure("Body.TLabel", background="#13212e", foreground="#c7d7ea", font=("Segoe UI", 11))
        style.configure("Field.TLabel", background="#0f1720", foreground="#dbe7f4", font=("Segoe UI", 10, "bold"))
        style.configure("Path.TLabel", background="#1a2a39", foreground="#d7e6f7", font=("Segoe UI", 10))
        style.configure("Action.TButton", font=("Segoe UI", 11, "bold"), padding=(16, 10))
        style.configure("Browse.TButton", font=("Segoe UI", 10, "bold"), padding=(12, 8))
        style.configure("Status.TLabel", background="#0f1720", foreground="#f8c86c", font=("Segoe UI", 10))
        style.configure("MetaValue.TLabel", background="#13212e", foreground="#f5f8fc", font=("Segoe UI", 11, "bold"))
        style.configure("MetaLabel.TLabel", background="#13212e", foreground="#93adca", font=("Segoe UI", 9))
        style.configure(
            "App.Horizontal.TProgressbar",
            troughcolor="#223445",
            background="#ff8f32",
            bordercolor="#223445",
            lightcolor="#ff8f32",
            darkcolor="#ff8f32",
        )

        container = ttk.Frame(self.root, style="Main.TFrame", padding=20)
        container.pack(fill="both", expand=True)

        hero = ttk.Frame(container, style="Card.TFrame", padding=24)
        hero.pack(fill="x")

        hero_canvas = tk.Canvas(hero, height=170, bg="#13212e", highlightthickness=0)
        hero_canvas.pack(fill="x")
        self.hero_canvas = hero_canvas
        self._draw_hero(hero_canvas)

        ttk.Label(hero, text="האפליקציה של איתי האלוף", style="Header.TLabel").place(x=26, y=18)
        ttk.Label(
            hero,
            text="גרסת Desktop מקומית ללא Streamlit. בחר סרטון, תן ל-YOLO לעבוד, וקבל היילייטס מוכנים.",
            style="Body.TLabel",
        ).place(x=28, y=58)

        content = ttk.Frame(container, style="Main.TFrame", padding=(0, 22, 0, 0))
        content.pack(fill="both", expand=True)

        top_row = ttk.Frame(content, style="Main.TFrame")
        top_row.pack(fill="both", expand=True)

        files_card = ttk.Frame(top_row, style="Card.TFrame", padding=20)
        files_card.pack(side="left", fill="both", expand=True)

        ttk.Label(files_card, text="וידאו מקור", style="Field.TLabel").pack(anchor="w")
        input_row = ttk.Frame(files_card, style="Card.TFrame")
        input_row.pack(fill="x", pady=(8, 16))
        ttk.Label(input_row, textvariable=self.input_path, style="Path.TLabel", anchor="w", padding=10).pack(side="left", fill="x", expand=True)
        ttk.Button(input_row, text="בחר קובץ", style="Browse.TButton", command=self._browse_input).pack(side="left", padx=(12, 0))

        ttk.Label(files_card, text="קובץ יעד", style="Field.TLabel").pack(anchor="w")
        output_row = ttk.Frame(files_card, style="Card.TFrame")
        output_row.pack(fill="x", pady=(8, 0))
        ttk.Label(output_row, textvariable=self.output_path, style="Path.TLabel", anchor="w", padding=10).pack(side="left", fill="x", expand=True)
        ttk.Button(output_row, text="שמור בשם", style="Browse.TButton", command=self._browse_output).pack(side="left", padx=(12, 0))

        preview_card = ttk.Frame(top_row, style="Card.TFrame", padding=20)
        preview_card.pack(side="left", fill="both", padx=(20, 0))

        ttk.Label(preview_card, text="Preview", style="Field.TLabel").pack(anchor="w")
        self.preview_label = tk.Label(
            preview_card,
            text="כאן תופיע תמונת preview של הווידאו",
            bg="#0d1722",
            fg="#b7cae0",
            width=34,
            height=12,
            relief="flat",
            justify="center",
        )
        self.preview_label.pack(pady=(10, 14), fill="both", expand=True)

        meta_grid = ttk.Frame(preview_card, style="Card.TFrame")
        meta_grid.pack(fill="x")
        self._add_meta_item(meta_grid, "שם קובץ", self.meta_vars["name"], 0)
        self._add_meta_item(meta_grid, "משך", self.meta_vars["duration"], 1)
        self._add_meta_item(meta_grid, "רזולוציה", self.meta_vars["resolution"], 2)
        self._add_meta_item(meta_grid, "גודל", self.meta_vars["size"], 3)

        status_card = ttk.Frame(content, style="Main.TFrame", padding=(0, 20, 0, 0))
        status_card.pack(fill="x")

        ttk.Progressbar(
            status_card,
            variable=self.progress_value,
            style="App.Horizontal.TProgressbar",
            maximum=100,
        ).pack(fill="x")
        ttk.Label(status_card, textvariable=self.status_text, style="Status.TLabel").pack(anchor="w", pady=(10, 0))

        actions = ttk.Frame(content, style="Main.TFrame", padding=(0, 20, 0, 0))
        actions.pack(fill="x")
        ttk.Button(actions, text="צור היילייטס", style="Action.TButton", command=self._start_processing).pack(side="left")
        ttk.Button(actions, text="פתח תיקיית פלט", style="Browse.TButton", command=self._open_output_folder).pack(side="left", padx=(12, 0))

        tips = ttk.Frame(content, style="Card.TFrame", padding=18)
        tips.pack(fill="both", expand=True, pady=(20, 0))
        tips_text = (
            "טיפים לעבודה מקומית:\n"
            "- אין צורך ב-admin כדי להריץ את גרסת ה-Desktop הזו.\n"
            "- ל-16GB RAM חצי שעה וידאו אמורה לעבוד בצורה סבירה.\n"
            "- אם הפלט עדיין לא נבחר, האפליקציה תציע שם קובץ אוטומטי.\n"
            "- בחירה של וידאו תציג thumbnail ומידע כדי לוודא שבחרת את הקובץ הנכון."
        )
        ttk.Label(tips, text=tips_text, style="Body.TLabel", justify="left").pack(anchor="w")

        default_output = os.path.join(os.getcwd(), "highlights.mp4")
        self.output_path.set(default_output)
        self.input_path.set("עדיין לא נבחר קובץ")

    def _add_meta_item(self, parent, label, variable, row):
        item = ttk.Frame(parent, style="Card.TFrame")
        item.grid(row=row // 2, column=row % 2, sticky="nsew", padx=(0, 10), pady=(0, 10))
        ttk.Label(item, text=label, style="MetaLabel.TLabel").pack(anchor="w")
        ttk.Label(item, textvariable=variable, style="MetaValue.TLabel", wraplength=170).pack(anchor="w", pady=(2, 0))
        parent.grid_columnconfigure(row % 2, weight=1)

    def _draw_hero(self, canvas):
        width = 860
        height = 170
        canvas.create_rectangle(0, 0, width, height, fill="#13212e", outline="#13212e")
        canvas.create_oval(620, 16, 940, 250, fill="#1a3145", outline="")
        canvas.create_oval(728, 46, 772, 90, outline="#ff6326", width=4)
        canvas.create_line(750, 44, 750, 8, fill="#eef4fb", width=5)
        canvas.create_rectangle(728, 0, 772, 18, fill="#eef4fb", outline="#eef4fb")
        canvas.create_line(728, 92, 738, 118, fill="#eef4fb", width=2)
        canvas.create_line(772, 92, 762, 118, fill="#eef4fb", width=2)
        canvas.create_oval(118, 48, 168, 98, fill="#f7b26b", outline="")
        canvas.create_line(144, 98, 144, 142, fill="#f7b26b", width=10)
        canvas.create_line(144, 108, 116, 130, fill="#f7b26b", width=8)
        canvas.create_line(144, 108, 176, 88, fill="#f7b26b", width=8)
        canvas.create_line(144, 142, 126, 166, fill="#f7b26b", width=8)
        canvas.create_line(144, 142, 166, 166, fill="#f7b26b", width=8)
        canvas.create_arc(182, 40, 730, 118, start=18, extent=128, style="arc", outline="#ff8f32", width=4)
        self.hero_ball = canvas.create_oval(182, 54, 200, 72, fill="#ff8f32", outline="#59351d", width=2)
        canvas.create_text(488, 130, text="ילד מקומי, YOLO אמיתי, בלי דפדפן.", fill="#d6e5f6", font=("Segoe UI", 12, "bold"))

    def _animate_hero_ball(self):
        if self.hero_canvas is not None and self.hero_ball is not None:
            offset = (self.hero_ball_phase % 30) - 15
            coords = (182 + offset, 54 - abs(offset) // 2, 200 + offset, 72 - abs(offset) // 2)
            self.hero_canvas.coords(self.hero_ball, *coords)
            self.hero_ball_phase += 1
        self.root.after(90, self._animate_hero_ball)

    def _format_duration(self, seconds):
        total_seconds = int(seconds)
        minutes, secs = divmod(total_seconds, 60)
        hours, minutes = divmod(minutes, 60)
        if hours:
            return f"{hours}:{minutes:02d}:{secs:02d}"
        return f"{minutes}:{secs:02d}"

    def _format_size(self, path):
        size_bytes = os.path.getsize(path)
        for unit in ["B", "KB", "MB", "GB"]:
            if size_bytes < 1024 or unit == "GB":
                return f"{size_bytes:.1f} {unit}" if unit != "B" else f"{size_bytes} B"
            size_bytes /= 1024

    def _update_preview(self, video_path):
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            self.preview_label.configure(image="", text="לא ניתן לפתוח preview לקובץ הזה")
            return

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_to_capture = max(total_frames // 3, 0)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_to_capture)
        ok, frame = cap.read()
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        cap.release()

        self.meta_vars["name"].set(os.path.basename(video_path))
        self.meta_vars["duration"].set(self._format_duration(total_frames / max(fps, 1)))
        self.meta_vars["resolution"].set(f"{width}x{height}")
        self.meta_vars["size"].set(self._format_size(video_path))

        if not ok:
            self.preview_label.configure(image="", text="לא ניתן היה לשלוף frame ל-preview")
            return

        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = Image.fromarray(frame_rgb)
        image.thumbnail((320, 200))
        self.preview_image = image
        self.preview_photo = ImageTk.PhotoImage(image)
        self.preview_label.configure(image=self.preview_photo, text="")

    def _browse_input(self):
        selected = filedialog.askopenfilename(
            title="בחר וידאו",
            filetypes=[("Video files", "*.mp4 *.mov *.m4v *.avi"), ("All files", "*.*")],
        )
        if not selected:
            return

        self.input_path.set(selected)
        if self.output_path.get().endswith("highlights.mp4"):
            base_name = os.path.splitext(os.path.basename(selected))[0]
            self.output_path.set(os.path.join(os.path.dirname(selected), f"{base_name}_highlights.mp4"))
        self._update_preview(selected)
        self.status_text.set("קובץ הווידאו נטען. אפשר להתחיל עיבוד.")

    def _browse_output(self):
        selected = filedialog.asksaveasfilename(
            title="שמור קובץ היילייטס",
            defaultextension=".mp4",
            initialfile=os.path.basename(self.output_path.get()) or "highlights.mp4",
            filetypes=[("MP4 video", "*.mp4")],
        )
        if selected:
            self.output_path.set(selected)

    def _start_processing(self):
        if self.processing:
            return

        input_path = self.input_path.get().strip()
        output_path = self.output_path.get().strip()

        if not input_path or input_path == "עדיין לא נבחר קובץ" or not os.path.exists(input_path):
            messagebox.showwarning("חסר קובץ", "בחר קודם קובץ וידאו תקין.")
            return

        if not output_path:
            messagebox.showwarning("חסר יעד", "בחר נתיב לשמירת קובץ ההיילייטס.")
            return

        self.processing = True
        self.progress_value.set(0)
        self.status_text.set("העיבוד התחיל. YOLO מנתח את הווידאו...")

        worker = threading.Thread(target=self._run_processing, args=(input_path, output_path), daemon=True)
        worker.start()

    def _run_processing(self, input_path, output_path):
        temp_input = None
        try:
            # Work on a temporary copy to avoid file-lock issues with selected files.
            with open(input_path, "rb") as src, tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(input_path)[1] or ".mp4") as temp_file:
                temp_file.write(src.read())
                temp_input = temp_file.name

            def update_progress(progress):
                self.queue.put(("progress", max(0, min(progress * 100, 100))))

            success, message = process_video(temp_input, output_path, update_progress)
            self.queue.put(("done", success, message, output_path))
        except Exception as exc:
            self.queue.put(("error", str(exc)))
        finally:
            if temp_input and os.path.exists(temp_input):
                try:
                    os.remove(temp_input)
                except OSError:
                    pass

    def _poll_queue(self):
        try:
            while True:
                item = self.queue.get_nowait()
                event = item[0]

                if event == "progress":
                    progress = item[1]
                    self.progress_value.set(progress)
                    self.status_text.set(f"מעבד וידאו... {progress:.0f}%")
                elif event == "done":
                    success, message, output_path = item[1], item[2], item[3]
                    self.processing = False
                    self.progress_value.set(100 if success else 0)
                    self.status_text.set(message)
                    if success:
                        messagebox.showinfo("הצלחה", f"ההיילייטס מוכנים:\n{output_path}")
                    else:
                        messagebox.showerror("שגיאה", message)
                elif event == "error":
                    self.processing = False
                    self.progress_value.set(0)
                    self.status_text.set("העיבוד נכשל.")
                    messagebox.showerror("שגיאה", item[1])
        except queue.Empty:
            pass
        finally:
            self.root.after(120, self._poll_queue)

    def _open_output_folder(self):
        output_path = self.output_path.get().strip()
        directory = os.path.dirname(output_path) if output_path else os.getcwd()
        if not os.path.isdir(directory):
            directory = os.getcwd()
        os.startfile(directory)


def main():
    root = tk.Tk()
    app = HighlightsDesktopApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()