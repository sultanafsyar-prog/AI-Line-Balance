# IE Line Balance System — User Guide

## 1. Getting Started

1. Open the production system URL in a supported browser.
2. Sign in with the company account assigned by IT or IE Admin.
3. Use the language selector to choose English, Indonesian, or Traditional Chinese.
4. The sidebar shows only the modules available to your role.

Never share passwords or use another employee's account. Contact IT Admin if the account, building, or line assignment is incorrect.

## 2. Role Quick Guide

| Role | Typical tasks |
|---|---|
| IE Admin | Manage models, standards, assignments, users, monitoring, history, and reports |
| IE Operator | Maintain IE standards and review production details |
| Team Leader | Enter hourly production and close assigned shifts |
| Management | Review dashboards, monitoring, analytics, and reports |
| IT Admin | Manage users and technical access |
| PPIC | Maintain or review production targets and planning data |

## 3. Model Library

### Create a Model Manually

1. Open **Model Library**.
2. Select **Create manually**.
3. Enter model name, article, stage, line type, and target information.
4. Add the required sections.
5. For each section, enter standard manpower, takt time, hourly target, and operations.
6. Review warnings for missing or unusual manpower values.
7. Save the model.

### Import an NB Standard

1. Open **Model Library**.
2. Download the available Excel template when needed.
3. Select **Upload NB Standard** and choose the Excel file.
4. Review the parsed model, sections, and operations.
5. Correct incomplete or incorrectly parsed values.
6. Save only after the review is complete.

### Edit a Model

1. Select the model from the library.
2. Open **Edit Model**.
3. Update metadata, standards, sections, or operations.
4. Save the changes.

Historical production entries remain connected to their section records. Do not create a duplicate model merely to correct a spelling error.

### Upload a Model Image

1. Open the model editor or image action.
2. Select a JPG, PNG, or WebP image up to the permitted size.
3. Upload and confirm that the image appears.

The monitor/TV standard cache is refreshed after a successful image change.

## 4. Assign Models to a Line

1. Open the line or assignment management screen.
2. Select the building and line.
3. Add the model currently scheduled for production.
4. Keep more than one model active when the line is running several styles in the same period.
5. Remove or deactivate an assignment only when it is no longer valid.

Production input accepts only sections belonging to models actively assigned to the selected line.

## 5. Enter Production Actuals

1. Open **Input Actual** or the Team Leader page.
2. Select the assigned line.
3. Select the model/style currently running.
4. Select the production section.
5. Select **Shift 1** or **Shift 2**.
6. Select **Normal**, **OT 1 hour**, **OT 2 hours**, or **OT 3 hours**.
7. Select the hourly slot.
8. Enter:
   - Output quantity.
   - Actual manpower present.
   - Downtime in minutes.
   - Downtime reason when downtime occurred.
   - Defect quantity.
9. Review the values and select **Save**.

Saving the same line, section, date, and hour again updates that entry. The system asks for confirmation when an existing hourly entry will be overwritten.

### Shift 1 Schedule

- Normal: 07:30–16:30.
- Break: 12:30–13:30.
- Friday: 07:30–17:00 with break 11:30–13:00.
- Overtime adds 1–3 hours after normal completion.

### Shift 2 Schedule

- Normal: 20:30–05:30 next day.
- Default break: 00:30–01:30.
- Overtime adds 1–3 hours after 05:30.
- After-midnight entries remain under the date when Shift 2 started.

## 6. Half-Day or Partial-Shift Input

Partial input is supported.

Example: production runs only from 07:30 to 12:30.

1. Enter each hourly slot that actually ran.
2. Leave unused slots without entries; do not create false zero-output records unless zero production is operationally meaningful.
3. Select **Close Shift** when production for that shift is finished.

Important: closing locks the whole selected shift. You cannot add the remaining hours afterward through normal input. Contact an authorized administrator if a correction is required.

## 7. Close a Shift

1. Confirm that the correct line and shift are displayed.
2. Verify all available production entries.
3. Select **Close Shift**.
4. If the email option is shown, enter a valid manager email or leave it empty.
5. Confirm the action.

The system will:

- Create one archive for the selected line, production date, and shift.
- Lock the actual entries in that shift.
- Keep the other shift on the same date available.
- Send the optional email only after the archive is saved successfully.

If the system says the shift is already closed, first confirm the line, production date, and shift. Do not repeatedly retry. Review **Shift History** or contact IE Admin.

## 8. Monitor and TV View

Use **Monitor** to review:

- Active lines and assigned models.
- Current output and target comparison.
- Average LLER.
- Lines with missing input.
- Lines below the attention threshold.
- Active operational alerts.

Use the TV view for shared floor visibility. Refresh manually if required; standard changes normally invalidate the cache automatically.

## 9. Shift History

1. Open **Shift History**.
2. Filter by period, building, line, shift, or date.
3. Select an archive row to open hourly detail.

The archive list shows model/style information for lines that ran one or more models. Hourly detail includes:

- Production hour.
- Model/style.
- Section.
- Output and target.
- Standard, theoretical, and actual manpower.
- LLER.
- Downtime and reason.
- Defects.

Use **Export Excel** to download the filtered history when available.

## 10. Analytics and Daily Export

Use **Analytics** to review performance trends over the selected period. Results are restricted to the user's permitted building or assigned lines.

Use **Export today's report** or the daily export action to download line summaries and hourly details. Confirm the selected date before sharing the file.

## 11. Troubleshooting

### “You do not have access to this line”

The account is not assigned to the line or building. Ask IE Admin or IT Admin to verify access.

### “Section/model is not active on this line”

The selected section belongs to a model that is not actively assigned to the line. Correct the line assignment or select the correct model.

### “Shift already closed”

The selected line/date/shift already has an archive. Review Shift History. Normal input cannot change a closed shift.

### Invalid hourly slot

Select a slot displayed by the system. Break times and hours outside normal plus maximum overtime are rejected.

### Connection interruption

Keep the page open and restore the network. The floor input flow can queue temporary offline submissions, but verify that the entry appears after reconnection before closing the shift.

### Session expired

Sign in again. Unsaved form values may need to be re-entered.

### Model or image not updated on TV

Refresh the TV screen once. If the old value remains, report the model name and line to IT.

## 12. Barcode and MES Status

Barcode scanning from MES is not active in the current release. Do not connect directly to the MES production database using a personal or administrator account.

Future integration should follow this sequence:

1. MES/IT provides barcode meaning and approved data ownership.
2. MES/IT provides a read-only API, view, or integration account.
3. The Line Balance system maps the barcode to model/style and production order.
4. A test environment validates performance and data correctness before production use.

