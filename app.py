import streamlit as st
import os
import tempfile
from processor import process_video

st.set_page_config(page_title="Basketball Highlights MVP", page_icon="🏀", layout="centered")

st.title("🏀 יוצר היילייטס כדורסל אוטומטי (MVP)")
st.markdown("""
העלה צילום וידאו של משחק כדורסל, והמערכת תנסה לזהות את כל הזריקות (התנועות הפרבוליות של הכדור באוויר) ותייצר עבורך סרטון ערוך רק עם הקליעות!

*שים לב: מערכת זו משתמשת במודל AI כללי. היא מזהה זריקות לסל אבל לא רשת מושלמת, וזהו בסיס נהדר לפיתוח מודל מתקדם יותר.*
""")

uploaded_file = st.file_uploader("העלה וידאו (MP4, MOV)", type=["mp4", "mov"])

if uploaded_file is None:
    st.info("כדי להתחיל עריכה, העלה קודם קובץ וידאו ואז לחץ על כפתור העריכה.")

process_clicked = st.button("✂️ צור וידאו ערוך!", disabled=uploaded_file is None)

if uploaded_file is not None:
    st.video(uploaded_file)

if process_clicked and uploaded_file is not None:
        # Create temporary file to pass to openCV and MoviePy
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as temp_input:
            temp_input.write(uploaded_file.read())
            input_path = temp_input.name
            
        output_path = tempfile.mktemp(suffix='.mp4')
        
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
                btn = st.download_button(
                    label="⬇️ הורד את סרטון ההיילייטס",
                    data=file,
                    file_name="highlights.mp4",
                    mime="video/mp4"
                )
        else:
            st.error(msg)
            
        # Cleanup input temp file
        try:
            os.remove(input_path)
        except Exception as e:
            pass
