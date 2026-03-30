import streamlit as st
import os
import tempfile
import base64
import streamlit.components.v1 as components
from processor import process_video

st.set_page_config(page_title="Basketball Highlights MVP", page_icon="🏀", layout="centered")

HERO_IMAGE_PATH = "assets/hero-image.jpg"


def _background_image_css(image_path):
    if not os.path.exists(image_path):
        return ""

    ext = os.path.splitext(image_path)[1].lower()
    mime = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }.get(ext, "image/jpeg")

    with open(image_path, "rb") as image_file:
        encoded = base64.b64encode(image_file.read()).decode("ascii")

    return f"""
        .stApp {{
            background:
                linear-gradient(rgba(7, 15, 26, 0.72), rgba(7, 15, 26, 0.72)),
                url('data:{mime};base64,{encoded}');
            background-size: cover;
            background-position: center;
            background-attachment: fixed;
        }}
    """


BG_IMAGE_CSS = _background_image_css(HERO_IMAGE_PATH)

ui_html = """
        <style>
            .stApp {
                background:
                    radial-gradient(circle at 8% 12%, rgba(255, 139, 45, 0.24), transparent 35%),
                    radial-gradient(circle at 92% 88%, rgba(98, 229, 255, 0.18), transparent 38%),
                    linear-gradient(140deg, #0b1117, #162331 55%, #0e1a28);
            }

            __BG_IMAGE_CSS__

            .bb-shell {
                position: relative;
                border: 1px solid rgba(146, 188, 235, 0.25);
                border-radius: 20px;
                background: rgba(7, 16, 28, 0.72);
                box-shadow: 0 18px 55px rgba(0, 0, 0, 0.35);
                overflow: hidden;
                padding: 16px;
                margin-bottom: 18px;
            }

            .bb-shell h3 {
                margin: 0 0 8px;
                color: #f5f7fb;
                font-size: 1.2rem;
            }

            .bb-shell p {
                margin: 0;
                color: #bfd6f2;
                line-height: 1.55;
            }

            .ball {
                position: absolute;
                border-radius: 50%;
                background: radial-gradient(circle at 30% 30%, #ffb76e, #ff7b1c 62%, #b34b00);
                border: 2px solid rgba(255, 225, 194, 0.35);
                box-shadow: inset -14px -14px 24px rgba(0, 0, 0, 0.25);
            }

            .ball::before,
            .ball::after {
                content: "";
                position: absolute;
                inset: 14%;
                border: 2px solid rgba(58, 20, 0, 0.75);
                border-radius: 50%;
            }

            .ball::after {
                inset: 28% 12%;
            }

            .ball-a {
                width: 92px;
                height: 92px;
                left: -14px;
                top: 8px;
                animation: bob 4.4s ease-in-out infinite;
            }

            .ball-b {
                width: 68px;
                height: 68px;
                right: 14px;
                bottom: -8px;
                animation: bob 5.1s ease-in-out infinite reverse;
            }

            .ball-c {
                width: 48px;
                height: 48px;
                right: 34%;
                top: -12px;
                animation: drift 6.4s linear infinite;
            }

            @keyframes bob {
                0%, 100% { transform: translateY(0) rotate(-8deg); }
                50% { transform: translateY(-10px) rotate(-2deg); }
            }

            @keyframes drift {
                0% { transform: translateY(0) rotate(0deg); opacity: 0.9; }
                50% { transform: translateY(8px) rotate(14deg); opacity: 1; }
                100% { transform: translateY(0) rotate(0deg); opacity: 0.9; }
            }

            /* Animations for Kid Shooting Basket */
            .kid-container {
                position: relative;
                height: 120px;
                width: 100%;
                margin-top: 15px;
                overflow: hidden;
                border-top: 1px solid rgba(255,255,255,0.1);
                padding-top: 10px;
            }

            .basket {
                position: absolute;
                right: 20px;
                top: 20px;
                width: 40px;
                height: 40px;
                border: 3px solid #ff4d4d;
                border-radius: 50%;
                background: repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.2) 5px, rgba(255,255,255,0.2) 10px);
            }
            .basket::after {
                content: "";
                position: absolute;
                top: -15px;
                left: 50%;
                width: 40px;
                height: 30px;
                background: white;
                transform: translateX(-50%);
                border: 2px solid #333;
                z-index: -1;
            }

            .kid {
                position: absolute;
                left: 30px;
                bottom: 10px;
                width: 30px;
                height: 50px;
                background: #ffcc99;
                border-radius: 10px 10px 0 0;
            }
            .kid::before {
                content: "⛹️‍♂️";
                font-size: 40px;
                position: absolute;
                top: -30px;
                left: -5px;
                display: inline-block;
                transform: scaleX(-1);
            }

            .shot-ball {
                position: absolute;
                width: 15px;
                height: 15px;
                background: orange;
                border-radius: 50%;
                border: 1px solid black;
                left: 60px;
                bottom: 40px;
                animation: shoot 3s infinite ease-in-out;
            }

            @keyframes shoot {
                0% { left: 45px; bottom: 40px; opacity: 1; }
                50% { left: 160px; bottom: 100px; }
                80% { left: 280px; bottom: 70px; opacity: 1; }
                100% { left: 280px; bottom: 20px; opacity: 0; }
            }

            /* Replace default dropzone headline across Streamlit variants */
            [data-testid="stFileUploaderDropzone"] [data-testid="stMarkdownContainer"] p:first-child,
            [data-testid="stFileDropzoneInstructions"] > div > span:first-child {
                font-size: 0 !important;
                position: relative;
            }

            [data-testid="stFileUploaderDropzone"] [data-testid="stMarkdownContainer"] p:first-child::after,
            [data-testid="stFileDropzoneInstructions"] > div > span:first-child::after {
                content: "איתי כאן אתה יוצר את הקסם";
                font-size: 1rem;
                direction: rtl;
                unicode-bidi: plaintext;
            }
        </style>

        <div class="bb-shell">
            <h3>האפליקציה של איתי האלוף</h3>
            <p>המערכת מעבדת את המשחק ומייצרת אוטומטית קטעי קליעות עם אווירת כדורסל מונפשת.</p>
            <div class="kid-container">
                <div class="basket"></div>
                <div class="kid"></div>
                <div class="shot-ball"></div>
            </div>
        </div>
    """

st.markdown(ui_html.replace("__BG_IMAGE_CSS__", BG_IMAGE_CSS), unsafe_allow_html=True)

components.html(
        """
        <script>
            const TARGET_TEXT = "איתי כאן אתה יוצר את הקסם";

            function applyOverride() {
                const doc = window.parent.document;

                const selectors = [
                    '[data-testid="stFileUploaderDropzoneInstructions"] span',
                    '[data-testid="stFileDropzoneInstructions"] span',
                    '[data-testid="stFileUploaderDropzone"] p',
                    '[data-testid="stFileUploaderDropzone"] span'
                ];

                selectors.forEach((selector) => {
                    doc.querySelectorAll(selector).forEach((el) => {
                        const text = (el.textContent || '').trim();
                        if (text === 'Drag and drop file here') {
                            el.textContent = TARGET_TEXT;
                            el.style.direction = 'rtl';
                        }
                    });
                });
            }

            applyOverride();
            setInterval(applyOverride, 700);
        </script>
        """,
        height=0,
)

if not os.path.exists(HERO_IMAGE_PATH):
    st.info(
        "כדי שהתמונה תהיה כרקע מאחור, הוסף קובץ תמונה לנתיב: assets/hero-image.jpg"
    )

st.title("יוצר הסרטונים של איתי האלוף")
st.markdown("""
העלה צילום וידאו של משחק כדורסל, והמערכת תנסה לזהות את כל הזריקות (התנועות הפרבוליות של הכדור באוויר) ותייצר עבורך סרטון ערוך רק עם הקליעות!

*שים לב: מערכת זו משתמשת במודל AI כללי. היא מזהה זריקות לסל אבל לא רשת מושלמת, וזהו בסיס נהדר לפיתוח מודל מתקדם יותר.*
""")

uploaded_file = st.file_uploader("איתי כאן אתה יוצר את הקסם", type=["mp4", "mov"])

if uploaded_file is None:
    st.info("כדי להתחיל עריכה, העלה קודם קובץ וידאו ואז לחץ על כפתור העריכה.")

process_clicked = st.button("✂️ צור וידאו ערוך!", disabled=uploaded_file is None)

if uploaded_file is not None:
    st.video(uploaded_file.getvalue())

if process_clicked and uploaded_file is not None:
    # Create temporary file to pass to OpenCV and MoviePy
    input_path = None
    output_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as temp_input:
            temp_input.write(uploaded_file.getvalue())
            input_path = temp_input.name

        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as temp_output:
            output_path = temp_output.name

        progress_bar = st.progress(0)
        status_text = st.empty()
        status_text.text("מעבר על הפריימים וזיהוי הכדור - זה עשוי לקחת כמה דקות...")

        def update_progress(progress):
            progress_bar.progress(progress)

        with st.spinner("המערכת מנתחת את הוידאו בעזרת YOLO AI..."):
            success, msg = process_video(input_path, output_path, update_progress)

        if success:
            st.success("הוידאו מוכן!")
            st.balloons()
            st.video(output_path)

            with open(output_path, "rb") as file:
                st.download_button(
                    label="⬇️ הורד את סרטון ההיילייטס",
                    data=file,
                    file_name="highlights.mp4",
                    mime="video/mp4"
                )
        else:
            st.error(msg)
    finally:
        # Cleanup temporary files
        for temp_path in [input_path, output_path]:
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
