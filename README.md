# MEDICO Multiscreen Healthcare Demo

## Create/run in VS Code
1. Install Node.js LTS: https://nodejs.org/
2. Open this project folder in VS Code.
3. Open Terminal → New Terminal.
4. Run `npm install`
5. Run `npm start`
6. Open `http://localhost:3000`

No SQL database is used. The server creates `data/users.json`, `data/appointments.json`, and `data/records.json` automatically.

## Included screens
- Landing page: choose Patient or Doctor.
- Separate registration/login flows for each role.
- Sidebar: Overview, Profile, Appointments, Find Doctors, Prescriptions & Reports, Medicines (patient); Overview, Profile, Appointments, Sent Records (doctor).
- Patient appointment booking: Online consultation OR Doctor home visit, with date/time and address for home visits.
- Doctor appointment list: confirm, decline, mark completed.
- Doctor can send a prescription or report linked to an appointment.
- Patient can see only records linked to their account and use browser Print → Save as PDF.
- Sample medicines catalogue.

## Important honest limitations
This is a local learning prototype, NOT a production healthcare service.
- No SQL database; JSON files are simple local storage on the server. They are not suitable for concurrent production workloads and are not encrypted at rest.
- Doctor accounts remain `pending`; no real admin verification screen is included. The patient doctor directory intentionally shows only doctors whose `verificationStatus` is set to `verified` by a trusted administrator. Do not manually mark unverified doctors verified in a real service.
- PDF output uses the browser print dialog. It is a generated demo document, not a digitally signed prescription.
- Online video consultation, home-visit dispatch, report file upload, pharmacy checkout, payments, inventory, delivery and notifications are not implemented.
- Do not enter real patient names, health data, medical reports, or production passwords.
- Before public use, add administrator-controlled doctor credential verification, HTTPS, a persistent secure session store, CSRF protection, encrypted database and file storage, audit logs, backups, access reviews, legal/privacy compliance and security testing.
- Express's default in-memory session store is for local development only.

Optional: set a long random `SESSION_SECRET` before running. PowerShell:
`$env:SESSION_SECRET="your-long-random-secret"; npm start`
