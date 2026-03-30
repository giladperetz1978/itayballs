# itayballs

אפליקציית כדורסל מקומית ליצירת היילייטס אוטומטיים מסרטון משחק.

## מה חשוב לדעת

- GitHub Pages יודע להגיש קבצים סטטיים בלבד (HTML/CSS/JS).
- האפליקציה כוללת גם גרסת Desktop מקומית ב-Tkinter ללא Streamlit.
- מנוע העיבוד נשאר Python + YOLO ולכן כדי להריץ אותו צריך Python מותקן, אבל לא צריך הרשאות admin לבניית/הרצת גרסת ה-Desktop.

## פריסה מומלצת: Streamlit Community Cloud

1. היכנס ל- https://share.streamlit.io/ עם חשבון GitHub.
2. בחר את הריפו: `giladperetz1978/itayballs`.
3. הגדר:
   - Branch: `main`
   - Main file path: `app.py`
4. לחץ Deploy.

השירות יתקין אוטומטית את מה שצריך מ-`requirements.txt` וגם מ-`packages.txt`.

## הרצה מקומית

```bash
pip install -r requirements.txt
streamlit run app.py
```

## הרצת Desktop מקומית

```bash
pip install -r desktop_requirements.txt
python desktop_app.py
```

הגרסה הזו פותחת חלון מקומי רגיל של Windows, מאפשרת לבחור קובץ וידאו וקובץ פלט, ומריצה את YOLO ישירות מהמחשב המקומי.