# IE Line Balance System — Product Requirements Document

**Document version:** 1.0  
**Product status:** Production  
**Primary languages:** Indonesian, English, Traditional Chinese  
**Audience:** Industrial Engineering, Production, PPIC, Management, and IT

## 1. Product Summary

IE Line Balance System is a web application for managing footwear production standards and comparing them with hourly production results. It connects IE standard data, model-to-line assignments, production input, line monitoring, shift archives, analytics, and operational reports in one controlled workflow.

The product is designed for factories where one production line may run several models or styles during the same shift. Every actual entry is linked to its line, model section, production date, and hourly slot so the history can show what style ran, where it ran, at what time, and how much output was produced.

## 2. Problem Statement

Production and IE teams need a shared source of truth for:

- IE standards, operations, takt time, manpower, and hourly targets.
- Models or styles currently running on each line.
- Hourly output, actual manpower, downtime, downtime reason, and defects.
- Line performance and LLER visibility during the shift.
- Reliable Shift 1 and Shift 2 closing without one shift blocking the other.
- Historical evidence by line, model, section, hour, date, and shift.
- Reports that respect the logged-in user's building or assigned-line access.

Without this system, standards and actuals can be separated across spreadsheets, shift identity can be ambiguous, and management cannot consistently trace production results back to a model and time slot.

## 3. Goals

1. Provide one operational source for IE standards and actual production data.
2. Allow production teams to enter accurate hourly or partial-shift data quickly.
3. Support multiple active models on one line without mixing model history.
4. Keep Shift 1 and Shift 2 archives independent and uniquely identifiable.
5. Give IE and management detailed, access-controlled production visibility.
6. Preserve audit history after a shift is closed.
7. Support factory-floor use on desktop and mobile browsers, including temporary offline input queuing.

## 4. Non-Goals

- The system does not replace the company MES.
- It does not currently read MES barcodes or write production input back to MES.
- It does not control machines, PLCs, scanners, or production equipment.
- It does not automatically decide which model should run on a line.
- It does not provide payroll, attendance, warehouse, or complete quality-management functions.

Barcode/MES connectivity is a future integration and must use an approved read-only API, database view, or middleware account supplied by the MES/IT owner.

## 5. Users and Permissions

| Role | Main responsibilities | Access scope |
|---|---|---|
| IE Admin | Manage standards, models, users, assignments, monitoring, reports, and shift history | All authorized production data |
| IE Operator | Manage model standards, monitor lines, input permitted data, and review details | All lines unless organizational scope limits access |
| Team Leader | Enter actual production and close shifts | Assigned lines only |
| Management | View dashboards, monitoring, analytics, and reports | Assigned building or global scope |
| IT Admin | Manage users and technical administration | Administrative scope |
| PPIC | Set or review production targets and line planning information | Planning-related production scope |

All protected pages and APIs require an authenticated session. Line-level validation is enforced on production writes and scoped reports.

## 6. Core Product Flows

### 6.1 Standard and Model Management

1. IE creates a model manually or imports an NB Standard Excel file.
2. IE reviews model metadata, sections, operations, VA/NVAN/NVA time, allowance, standard manpower, takt time, and hourly target.
3. IE saves the model and may upload a model image.
4. IE assigns one or more active models to a production line.
5. Updated standards become available to line, monitor, and TV views after cache invalidation.

### 6.2 Production Input

1. A Team Leader or authorized IE user selects a permitted line.
2. The user selects the active model and section.
3. The user selects Shift 1 or Shift 2 and an hourly slot.
4. The user enters output, actual manpower, downtime, downtime reason when applicable, and defect quantity.
5. The server verifies that the selected section belongs to a model actively assigned to that line.
6. The entry is created or updated for the unique line, section, date, and hour combination.

### 6.3 Partial-Day or Half-Shift Input

Users may enter only the hours that were worked—for example, the first half of Shift 1—and close the shift afterward. Missing hourly slots remain absent and are not automatically filled with zero.

Closing a partial shift locks the entire selected shift. Remaining hours cannot be entered afterward unless an authorized administrative correction process is performed.

### 6.4 Shift Closing

1. The user selects the displayed Shift 1 or Shift 2.
2. The system uses the production work date, including previous-date handling for Shift 2 after midnight.
3. The system confirms that the selected shift has actual data and has not already been archived.
4. Archive creation and actual-data locking occur in one database transaction.
5. An optional manager email is sent only after the transaction succeeds.
6. The archive appears in Shift History with model, section, hour, output, target, manpower, downtime, defect, and LLER details.

Only one archive may exist for each line, production date, and shift number.

## 7. Shift Rules

### Shift 1

- Normal schedule: 07:30–16:30.
- Normal break: 12:30–13:30.
- Friday schedule: 07:30–17:00.
- Friday break: 11:30–13:00.
- Overtime: selectable from 1 to 3 additional hours after the normal shift.

### Shift 2

- Normal schedule: 20:30–05:30 on the next calendar day.
- Default break: 00:30–01:30.
- Overtime: selectable from 1 to 3 additional hours after 05:30.
- Entries after midnight remain attached to the production date on which Shift 2 started.

The system supports exactly two production shifts. “Night shift” labels from older data are normalized to Shift 2.

## 8. Functional Requirements

### FR-1 Authentication and Authorization

- The system shall require login for protected operational pages.
- The system shall apply role-based navigation and API authorization.
- Team Leaders shall access only assigned lines.
- Building-scoped users shall receive reports only for their permitted building.

### FR-2 Model Library

- IE shall create, edit, deactivate, and view models.
- IE shall maintain model article, stage, line type, sections, operations, standards, and image.
- The system shall preserve historical actual references when standards are edited.

### FR-3 Line Assignment

- Authorized users shall assign multiple active models to one line.
- Actual input shall use only a section belonging to an active model assignment on that line.

### FR-4 Actual Production Input

- Authorized users shall record output, actual manpower, downtime, reason, and defect by production hour.
- Input shall be idempotent for the same line, section, date, and hour: saving again updates the existing entry.
- Invalid break or out-of-range hourly slots shall be rejected.
- Entries for a closed shift shall be rejected.

### FR-5 Alerts and Monitoring

- The system shall identify low output, high downtime, and high defect conditions.
- Monitor and TV views shall display current line performance and model information.
- Cached standards shall refresh after relevant model or assignment changes.

### FR-6 Shift Archive

- Shift 1 and Shift 2 shall close independently.
- The database shall prevent duplicate archives for the same line, date, and shift.
- The archive shall preserve totals and closure audit information.
- Closing one shift shall not lock the other shift on the same production date.

### FR-7 History, Analytics, and Export

- History shall support filtering by building, line, shift, date, and period.
- History detail shall show model/style, section, hour, output, target, standard MP, theoretical MP, actual MP, LLER, downtime, reason, and defects.
- Authorized users shall export daily and shift-history reports to Excel.
- Report queries shall follow the same line-access scope as the application UI.

### FR-8 Language Support

- The interface shall provide Indonesian, English, and Traditional Chinese translations for supported screens.

## 9. Data and Integrity Requirements

- `Actual` uniqueness: line + section + production date + hour.
- `ShiftArchive` uniqueness: line + production date + shift number.
- Actual data must reference an existing line, section, and input user.
- A section used for input must belong to an actively assigned model on the selected line.
- Shift closing must commit the archive and locking operation before sending external email.
- Historical duplicate archives must be reviewed and backed up before cleanup.

## 10. Performance and Reliability

- Standard data used by monitor and TV screens is cached to control database egress.
- Relevant model and assignment updates invalidate the shared standard cache.
- Production input supports a local offline queue for temporary connection interruptions.
- The UI shall show clear validation, locked-shift, authorization, and connection errors.

## 11. Security and Compliance

- Database and service credentials must remain in environment variables and must not be committed.
- MES access, if introduced, must use a dedicated least-privilege account and preferably a read-only view or API.
- Production data exports must respect role, building, and line access.
- Shift archives are audit records and must not be silently deleted.
- Database migrations require backup and duplicate-data preflight checks.

## 12. Success Metrics

- Percentage of active lines submitting production data each shift.
- Percentage of expected hourly slots entered before shift close.
- Number of duplicate shift-close attempts rejected safely.
- Time required for a Team Leader to submit one hourly entry.
- Percentage of archives with model and section traceability.
- Monitor availability and data freshness.
- Reduction in manual spreadsheet consolidation time.

## 13. Acceptance Criteria

1. Shift 1 and Shift 2 for the same line and production date can be closed independently.
2. A second close attempt for the same line/date/shift returns a clear “already closed” response without creating another archive.
3. Shift 2 data entered after midnight remains on the correct production work date.
4. Users can select normal time or 1–3 overtime hours.
5. Users can close a shift after entering only part of the shift; entered data is archived and the selected shift becomes locked.
6. A line running multiple models shows every model used in history and hourly detail.
7. A section from an unassigned model cannot be submitted to a line.
8. Team Leaders cannot read or write unassigned lines through either UI or API.
9. Daily export and analytics return only permitted lines.
10. Model and image changes refresh cached TV/monitor standards.

## 14. Future Roadmap

- MES barcode lookup through an IT-approved read-only integration.
- Barcode-to-model and barcode-to-production-order mapping.
- Configurable shift calendars when factory schedules become stable enough to justify administration UI.
- Formal archive reopening/correction workflow with reason and approval audit.
- Automated end-to-end tests for scanner, offline recovery, and shift-closing concurrency.

