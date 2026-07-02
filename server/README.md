# project-journal — שרת סנכרון

שרת קטן (Node, ללא תלויות חיצוניות) שמסנכרן את נתוני `project-journal` בין כל המכשירים.

- **פלטפורמה:** Railway — פרויקט `project-journal-sync`, שירות `project-journal-sync`.
- **כתובת:** `https://project-journal-sync-production.up.railway.app`
- **אחסון:** קובץ `state.json` בודד על Railway Volume הממופה ל-`/data` (נשמר בין דיפלויים והפעלות מחדש).
- **סנכרון:** Server-Sent Events — כל כתיבה משודרת לכל החיבורים הפתוחים.

## משתני סביבה (מוגדרים ב-Railway, לא בקוד)

| משתנה | תיאור |
|-------|-------|
| `SYNC_SECRET` | סיסמת הצוות. כל בקשה חייבת לשלוח אותה כ-`Authorization: Bearer <סיסמה>` (או `?token=` ל-SSE). |
| `DATA_DIR` | תיקיית הנתונים. מוגדר ל-`/data` (נקודת החיבור של ה-volume). |
| `ALLOW_ORIGIN` | כותרת CORS. מוגדר ל-`*` (האבטחה נשענת על הסיסמה, לא על ה-origin). |
| `PORT` | הפורט שהשרת מאזין לו (3000). |

## API

| מסלול | פעולה |
|-------|-------|
| `GET /health` | בדיקת חיים (ללא אימות). |
| `GET /state` | כל הפרויקטים. |
| `PUT /project` | עדכון/הוספה של פרויקט (גוף JSON עם `id`). |
| `DELETE /project?id=…&by=…` | מחיקת פרויקט. |
| `GET /events?token=…` | זרם SSE של שינויים. |

## פעולות תחזוקה נפוצות

מתוך תיקיית `server/`, כשמחוברים ל-Railway CLI:

```sh
# פריסה מחדש אחרי שינוי קוד
railway up

# החלפת סיסמת הצוות
railway variables --set "SYNC_SECRET=<סיסמה-חדשה>" --service project-journal-sync
railway redeploy --yes

# צפייה בלוגים
railway logs
```

> החלפת הסיסמה מנתקת את כל המכשירים — כל אחד יתבקש להזין את הסיסמה החדשה בכניסה הבאה.
