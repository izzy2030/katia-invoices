# Katia Body Shop

An offline-first desktop app for creating body shop repair orders and printable PDF estimates.

## Stack

- Electron + Electron Forge for Windows and macOS desktop builds
- React, TypeScript, and Vite for the app interface
- SQLite through Electron's bundled Node runtime for local storage

## Development

Requires Node.js 22.17 or newer.

```sh
npm install
npm start
```

## Features

- **Dashboard & Shop Floor Metrics**: Real-time overview of active repair orders, promises due today or overdue, and quick interactive filter toggles to immediately surface orders needing shop attention.
- **Dynamic Time-based Greeting & Brand Aesthetics**: Personalized shop floor header with cohesive Katia Auto Sales styling and quick repair order actions.
- **Repair Order Creation & Workflow**: Itemized parts, labor, sublet, fluids, disposal, and miscellaneous charges computed cleanly as quantity × unit price.
- **Automated Tax Calculation**: Configurable tax defaults per charge kind with line-by-line tax exemptions or overrides.
- **Supplement & Revised Work Tracking**: Additional work lines tracked alongside initial estimates, ensuring supplement totals and revised authorizations match printed PDF invoices.
- **Quick Promised Date Shortcuts**: Rapid one-click date presets (Same day, Tomorrow, +3 days, +1 week) for fast counter intake.
- **Landscape Letter PDF Estimates**: Pixel-perfect printable repair orders and estimates with customer signature capture, legacy shop notices in English and Spanish, and itemized supplements.
- **Direct Post-Export Actions**: One-click "Open PDF" notification button immediately after export to view or print the generated PDF.
- **Customer Profiles & Vehicle Histories**: Repeat customer tracking with vehicle fleet history, individual vehicle repair logs, lifetime customer spend calculations, and one-click prefilled repair order creation.
- **Editable Customer Contacts**: Stable customer renaming and phone/address updates without altering historical invoice records.
- **Data Safety & Backups**: One-click JSON database backup snapshot export and CSV spreadsheet export for bookkeeping and accounting.
- **Keyboard Shortcuts**: `Ctrl+N` / `Cmd+N` for a new repair order, `Ctrl+F` / `Cmd+F` to focus search, and `Escape` to close forms, dialogs, or active filters.
- **Offline-First Architecture**: Runs fully offline with Node's built-in SQLite engine and persistent per-user local storage.

The local database lives in Electron's per-user application data folder. Records do not sync between computers yet.
