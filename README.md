# itayballs

אפליקציית Streamlit ליצירת היילייטס כדורסל אוטומטיים מסרטון משחק.

## מה חשוב לדעת

- GitHub Pages יודע להגיש קבצים סטטיים בלבד (HTML/CSS/JS).
- האפליקציה הזו היא Python/Streamlit ולכן כדי שתעלה כמו בצילום (עם העלאת קובץ ועיבוד), צריך לפרוס אותה בשירות שתומך בהרצת Python.

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