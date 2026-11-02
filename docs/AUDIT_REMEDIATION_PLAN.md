# Implementation Plan: Audit Remediation (Bug Fixes + Simplification)

Status: **Phases 1–3 committed (`260863f`, `b65ce93`, `b9a8bfa`); Phase 0.4 complete (12/12 tests).**
Source: whole-repo `/ponytail-audit` of 2026-11-02 (23 over-engineering findings, 8 defects).
Baseline: `npm run typecheck` exits 0, `npm test` passes 9/9, `npm run lint` clean (0 warnings, 0 errors).

Phase 2 note: **2.4 was deliberately skipped.** `receiptFont.ts` is a 32 KB font payload, so inlining it into `receipt.ts` adds bulk without removing a layer. The other six items landed (−477 net lines, no dependency change).

Phase 3 note: the Resend/SMTP sender, email-settings types and IPC bridge are gone, and `nodemailer` + `@types/nodemailer` are uninstalled. Stored `app_settings` email rows were intentionally left in place.

Phase 0.4 note: `src/settingsStore.test.cjs` pins `writeSettingsToDb` → `getSettingsFromDb` (defaults, full round-trip, coercions, rejection) so Phase 4 can merge the two stores against a fixed contract.

---

## 1. Goal and constraints

Close every defect found in the audit and remove the dead weight it identified, without changing how the shop actually works.

**Hard constraints**

1. **No behaviour change to money.** `chargeTotals`, `supplementTotals`, `lineTotal`, tax rounding, and receipt layouts stay byte-identical. Simplification work must not touch pricing.
2. **Backup format stays `version: 1`.** Existing `.json` and `.sqlite` exports must keep importing.
3. **No destructive schema migration.** Existing `katia-body-shop*.sqlite` files must open and keep all rows.
4. **No new dependencies.** This plan removes two; it adds none.
5. **One phase per commit**, each gated on typecheck + tests; UI phases also need the manual smoke pass in §9.
6. `tsconfig.json` does **not** enable `noUnusedLocals`, and oxlint only reports `correctness`. Deletions therefore need an explicit `rg` check — `tsc` will not flag an orphaned import.

---

## 2. Decisions to settle before Phase 2

| #   | Question                                           | Options                                                | Recommendation                                                                                                                                                                                                                      |
| --- | -------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Legacy Resend / Gmail-SMTP email path              | (a) delete it, Gmail API only (b) keep it hidden       | **(a)**. Nothing in the UI calls `saveEmailSettings` or `sendTestEmail`; the only reachable entry is the stale post-save fallback that is itself bug #1.                                                                            |
| D2  | `work_orders.status` / `vehicle` columns           | (a) write them truthfully (b) drop them                | **(a) for this pass.** Dropping needs a migration plus removal of the legacy fallback in `listWorkOrdersFromDb`; writing them costs three lines and stops the column lying. Revisit (b) once no pre-1.1 backups are in circulation. |
| D3  | Second charge editor (`ChargeRows`)                | (a) fold into `WorkOrderCharges` compact mode (b) keep | **(a)**, done last in Phase 5. It is the largest renderer change and the most likely to regress the form.                                                                                                                           |
| D4  | `SettingsView` 30-prop drilling → one draft object | (a) do it (b) defer                                    | **(b) defer.** Pure ergonomics, no dead code removed, highest churn-to-value ratio. Tracked as finding 13.                                                                                                                          |

---

## 3. Phase 0 — Safety net (before touching logic)

Small, additive work so the later phases can be verified without clicking through Electron.

### 0.1 Record the baseline

```bash
npm run typecheck && npm run lint && npm test
```

Save the output (9 passing) in the PR description for every phase. No phase is allowed to reduce the pass count.

### 0.2 Extract `escapeHtml` (`src/html.ts`)

The receipt renderers each define an identical `e()`; the email bodies in `main.ts` define none. Move one implementation into `src/html.ts`, export `escapeHtml(value: unknown): string`, and switch both receipt files to it (no output change — same five entities).

**Test:** new `src/htmlEscape.test.cjs` following the existing `backupService.test.cjs` pattern:

- `& < > " '` round-trip to `&amp; &lt; &gt; &quot; &#39;`
- `null`/`undefined` → `''`
- a `{deposit}` policy string escapes the placeholder text but not the substituted currency

### 0.3 Extract provider resolution (`src/emailRouting.ts`)

Pure function the post-save prompt can call, so the provider decision is testable and stale component state can no longer route it:

```ts
export type EmailRoute =
  | { kind: 'gmail'; senderDescription: string }
  | { kind: 'none' };

export function resolveEmailRoute(
  gmail: { connected: boolean; email?: string } | null,
): EmailRoute;
```

**Test:** new `src/emailRouting.test.cjs` — connected Gmail returns `gmail`; `null`/disconnected returns `none`; the description includes the address when present.

### 0.4 Settings parity test (`src/settingsStore.test.cjs`)

Before merging the two settings stores (Phase 4), pin their behaviour: write a full `TaxSettings` through `writeSettingsToDb`, read it back through `getSettingsFromDb`, assert every field including `receiptStyle` and `defaults`. Use an in-memory `DatabaseSync`, as the backup tests already do.

---

## 4. Phase 1 — Defect fixes (independent, low risk)

Everything here is small and does not depend on the deletions. Ship as one commit, or split 1.1–1.3 / 1.4–1.7 if you prefer smaller diffs.

### 1.1 Bug #2 — "Open Google Cloud Console" does nothing

`shell.openPath` opens files, not URLs; the Gmail tab passes it an `https://` address.

- `src/main.ts` — new handler next to `shell:open-path`:

  ```ts
  ipcMain.handle('shell:open-external', async (_event, targetUrl: string) => {
    if (/^https?:\/\//i.test(targetUrl ?? '')) {
      await shell.openExternal(targetUrl);
      return true;
    }
    return false;
  });
  ```

- `src/preload.ts` — `openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url)`
- `src/declarations.d.ts` — add the signature
- `src/settings/GmailTab.tsx` — call `openExternal`, drop the `preventDefault` workaround

**Done when:** clicking the link opens the browser. **Verify:** click it once in `npm start`.

### 1.2 Bug #3 — shop defaults lost after the first save

`submitOrder` and `closeOrderForm` call `blankOrder(rate, shopDefaults)` and omit the third argument, so `shopCity/shopState/shopZip/defaultTerms/defaultWrittenBy/defaultTechnician` stop prefilling.

- `src/App.tsx` — pass `shopSettings` in both calls (lines 941 and 817).

**Done when:** save an order, start a new one, and the settings-derived defaults are still filled.

### 1.3 Bug #4 — in-progress draft destroyed by navigation

Opening Repair orders / Customers / Settings, or pressing Escape, unmounts the form and discards everything typed.

- `src/App.tsx` — add `confirmDiscardDraft()` reusing the existing modal pattern (`pendingDelete` is the model): when `isOrderBeingFilled(form, Boolean(editingId))`, show "Discard this draft?" with Keep editing / Discard. Route `startNewOrder`, `openCustomers`, `openTaxSettings`, the sidebar "Repair orders" handler, and the Escape branch through it.

**Done when:** typed text survives navigation unless the user confirms discard.

### 1.4 Bug #6 — a one-off tax rate silently becomes the shop default

`saveWorkOrder` upserts `app_settings.tax_rate` from the form on every create (`src/main.ts`, inside the create transaction).

- Delete that upsert. The rate is still remembered explicitly through Settings → Taxes and through the renderer's `savedTaxRate`.

**Done when:** entering 5% on one order and 8.25% on the next does not rewrite the shop default.

### 1.5 Bug #7 — unescaped customer data in email HTML

`sendOrderEmail` and `handleSendGmailOrderEmail` interpolate `customerName` and the personal note straight into markup.

- `src/main.ts` — use `escapeHtml` from Phase 0 on `customerName`, `vehicleName`, VIN, plate, subject-derived strings, and the note **before** `\n → <br/>`:

  ```ts
  escapeHtml(note).replace(/\n/g, '<br/>');
  ```

**Done when:** a customer named `A & B <Test>` receives a well-formed email.

### 1.6 Bug #8 — "Connected" is reported after a failed token refresh

`getGmailStatus` returns `connected: true` unless the error text contains `invalid_grant`/`revoked`.

- `src/gmailService.ts` — return `{ connected: false, needsReconnect: true, … }` on any failed refresh, and log the reason.
- `src/settings/types.ts`, `src/declarations.d.ts`, `src/settings/GmailTab.tsx` — surface a "Reconnect required" banner instead of the green badge.

**Done when:** a revoked/expired token shows as needing reconnect rather than as connected.

### 1.7 Bug #1 — post-save email routes to the dead Resend path

`gmailStatus` is only populated by `openEmailModal`, so right after a save it is `null` and the prompt falls through to `sendOrderEmail` (SMTP/Resend).

- `src/App.tsx` — in `sendPostSaveEmail`, read the status fresh:

  ```ts
  const gmail = await window.repairDesk.getGmailStatus().catch(() => null);
  if (resolveEmailRoute(gmail).kind === 'gmail') { …Gmail API… } else { …legacy… }
  ```

  Use `resolveEmailRoute` from Phase 0 and delete the `gmailStatus?.connected` condition.

This closes the defect immediately. Phase 3 then removes the `else` branch entirely, so the bug cannot come back.

**Done when:** save → "Send a copy via email?" → Send delivers through the connected Gmail account on a fresh app start.

---

## 5. Phase 2 — Delete dead code

All deletions are mechanical; none change behaviour. For each, run `rg "<symbol>" src` afterwards — `tsc` will not warn about an orphaned import.

### 2.1 Finding 2 — dead logo showcase (`src/logo.ts`, ~300 lines)

Delete `katiaBrandShowcaseHtml`, `katiaHorizontalLockupSvg`, `katiaGoogleProfileAvatarSvg`, `katiaAppIconSvg`, and the wordmark/tagline path constants only they use. Keep `katiaMarkPaths`, `katiaHexBadgeSvg`, `buildKatiaEmailBrandHeader` (used by `KatiaLogo`, both receipts, and `gmailService`).

**Check:** `rg "katiaBrandShowcase|katiaHorizontalLockup|katiaGoogleProfileAvatar|katiaAppIcon|KATIA_WORDMARK|KATIA_TAGLINE" src` → no hits. The PNG/SVG assets in `assets/` are untouched.

### 2.2 Finding 3 — unused OAuth loopback server (`src/gmailAuth.ts`, ~130 lines)

Delete `startLoopbackServer`. `gmailService.executeBrowserOAuthFlow` is the live implementation; nothing imports the other one.

**Check:** `rg "startLoopbackServer" src` → no hits.

### 2.3 Finding 19 — unused exports (`src/workOrder.ts`)

Delete `revisedEstimateTotal`, `defaultEmailSettings`, and stop exporting `RECEIPT_STYLES` (keep the const local to `normalizeReceiptStyle`). Note: `defaultEmailSettings` also disappears in Phase 3; deleting it here is fine either way.

### 2.4 Finding 23 — one-constant module (`src/receiptFont.ts`)

Inline `MANROPE_WOFF2_BASE64` into `src/receipt.ts` (the `@font-face` block) and delete the file. Keep the base64 string untouched.

### 2.5 Finding 21 — icon path probe (`src/main.ts`)

Replace the 8-candidate `getAppIconPath` loop with the two platform paths (`resources/icon.ico` on Windows, `resources/icon.png` elsewhere) plus one dev fallback (`assets/`).

**Verify:** packaged icon still appears; `npm start` window icon unchanged.

### 2.6 Finding 20 — dead props and dead filter state

- `src/WorkOrderCharges.tsx` — remove the `presets` prop (never passed) and the `propPresets` branch; always load from IPC.
- `src/WorkOrderCharges.tsx` — remove `quickFilter` (only ever `'all'` or `'parts'`; the section already scopes the list). Keep `quickSearch`.
- `src/SettingsView.tsx` and `src/settings/PresetsTab.tsx` — remove the `onPresetsChanged` prop and its three call sites (never passed by `App`; the `katia:presets-updated` window event already refreshes the editors).
- Keep `PresetsTab`'s `window.dispatchEvent(...)`.

**Verify:** presets added in Settings still appear in a form that is already open.

### 2.7 Finding 22 — the columns stop lying (per D2)

`status` is written only by backup import; `vehicle` only by create/update. Either both are maintained or both are noise.

- `src/main.ts` — add `status` to the create `INSERT`, to the update `UPDATE`, and to `setWorkOrderStatus`.
- `src/main.ts` — no read-path change (`listWorkOrders` correctly reads `data_json`).

**Done when:** `SELECT status FROM work_orders` matches what the dashboard shows.

---

## 6. Phase 3 — Retire the Resend / SMTP stack (D1)

One commit, applied in this order so the tree compiles at every step.

1. **Renderer** — `src/App.tsx`: delete the Resend/Gmail-SMTP branches of `checkEmailConfigured`; delete the legacy `sendOrderEmail` call in `sendPostSaveEmail` (Phase 1.7 left it as the `else`).
2. **Bridge** — `src/preload.ts`, `src/declarations.d.ts`: remove `getEmailSettings`, `saveEmailSettings`, `sendTestEmail`, `sendOrderEmail`.
3. **Main** — `src/main.ts`: remove the `email:*` IPC handlers, `getEmailSettings`, `saveEmailSettings`, `sendResendDelivery`, `sendGmailDelivery`, `dispatchEmail`, `sendTestEmail`, `sendOrderEmail`, the `nodemailer` import, and the now-unused `SendMailOptions`/`EmailProvider` imports.
4. **Types** — `src/workOrder.ts`: remove `EmailSettings`, `EmailProvider`, `defaultEmailSettings` (if 2.3 has not already).
5. **Dependencies** — `npm uninstall nodemailer @types/nodemailer`.

**Left behind on purpose:** the `app_settings` rows `email_provider`, `email_sender_name`, `resend_api_key`, `resend_from_email`, `gmail_user`, `gmail_app_password`. They are inert; deleting stored credentials is a separate, deliberate action. Do not add cleanup here.

**Done when:** `rg -i "resend|nodemailer|smtp" src` returns only historical comments (ideally none), `npm test` still 9/9, and the Gmail send + test-email paths work.

---

## 7. Phase 4 — One persistence layer

The schema and the settings reader/writer exist twice: `initializeDatabase` vs `ensureBackupSchema`, and `getSettings`/`saveSettings` vs `getSettingsFromDb`/`writeSettingsToDb`.

### 4.1 Schema (finding 10)

`initializeDatabase` calls `ensureBackupSchema(database)` instead of its own `CREATE TABLE` block. Keep only what is genuinely startup-specific: preset seeding and the dev demo order.

**Verify:** fresh dev DB (`katia-body-shop-dev.sqlite` moved aside) starts with all five tables, seeded presets, and the demo order.

### 4.2 Settings (finding 4 — this also resolves finding 5)

- `saveSettings(settings)` in `src/main.ts` keeps its validation, then calls `writeSettingsToDb(database, settings)` and returns `getSettingsFromDb(database)`.
- Delete the 15 inline upsert statements (finding 5) and the duplicated reader.
- **Watch:** `writeSettingsToDb` deliberately does not open a transaction (it runs inside `importBackupPayload`'s). In `saveSettings`, wrap the call in `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` to keep the current all-or-nothing behaviour.
- **Watch:** preserve the exact defaults and coercions (next-order-number digits-only, `receiptStyle` normalization) so nothing shifts.

**Verify:** `src/settingsStore.test.cjs` from 0.4 passes, plus the manual Settings save round-trip.

### 4.3 Amount validation (finding 18)

Export one `validateWorkOrderAmounts(input, label)` (put it in `src/workOrder.ts` or keep it in `backupService.ts` and import it). `validateWorkOrder` and `validateBackupWorkOrderAmounts` become one-line wrappers with their existing message text.

### 4.4 Preset seeding (finding 15)

Extract `seedCatalogPresets(db)` and call it from both `initializeDatabase` (when the count is zero) and `resetCatalogPresets` (after the delete).

**Verify:** "Reset to defaults" in Presets produces the same 11 rows as a fresh database.

### 4.5 Round-trip gate

After 4.1–4.4: export JSON → import merge into a copy → compare order count, totals, settings, receipt style. This is the phase most likely to hide a regression, so run it manually before committing.

---

## 8. Phase 5 — Renderer de-duplication

Ordered smallest to largest. Each item is independently revertable.

### 5.1 `applyDefaults` twice (finding 14)

`src/App.tsx` defines the identical taxable-line remap in `importBackup` and `saveShopSettings`. Hoist one `applyTaxDefaultChanges(lines, previous, next)` above the component.

### 5.2 Shop-defaults merge ×3 (finding 8)

The `city/state/zip/terms/writtenBy/technician/callWhenReady/saveOldParts` merge appears in the initial load, `importBackup`, and `saveShopSettings`. Hoist `applyShopDefaults(form, settings)`.

**Verify:** first run, after import, and after saving Settings all produce the same prefilled new order.

### 5.3 View reset ×6 (finding 11)

`startNewOrder`, `openCustomers`, `openTaxSettings`, `startFromHistory`, `startEdit`, `startDuplicate` repeat the same six resets. Hoist `resetWorkspace()`; keep per-function extras (`showAddress`, `duplicateOf`, …).

### 5.4 `isOrderBeingFilled` (finding 16)

Replace the 15 `Boolean(x?.trim())` clauses with a field list plus the existing charges check:

```ts
const filled = [
  form.customerName,
  form.phone,
  form.email,
  form.address /* … */,
];
return (
  filled.some((v) => Boolean(v?.trim())) || form.charges.some(hasChargeContent)
);
```

`datePromised`, VIN, plate and mileage must stay in the list — the current behaviour is what bug 1.3 relies on.

### 5.5 Notice severity (finding 17)

Replace the 12-alternative regex with explicit state: `setNotice(text, { error: true })`, defaulting to success. Update the ~20 call sites; error paths already read clearly.

**Verify:** every failure path still renders red (delete failure, backup failure, save failure).

### 5.6 `declarations.d.ts` (finding 9)

In `src/preload.ts`, build the API object as a named `const`, expose it, and export its type. In `declarations.d.ts`, `repairDesk: import('./preload').RepairDeskApi`. This removes ~90 lines of hand-maintained mirror; a missed method becomes a compile error instead of a runtime `undefined`.

**Verify:** typecheck only (no runtime change). Do this **after** Phase 3 so the API surface is already final.

### 5.7 One email modal (finding 7)

`postSaveEmailPrompt` and `emailModalOrder` render two near-identical dialogs sharing one `emailSending` flag. Replace with `<EmailOrderModal mode="post-save" | "full" …>`: post-save defaults the subject/note and hides the editable subject; full keeps them. One state object, one `emailSending`, and the shared-flag interaction bug goes away.

**Verify:** both entry points (row "Email", post-save prompt) send successfully and cannot double-submit.

### 5.8 Charge editors (finding 6, D3)

Fold `src/ChargeRows.tsx` into `WorkOrderCharges` with a `variant="compact" | "full"` prop; `LegacyFields` keeps receiving the compact editor as `revisedEditor`. Delete `ChargeRows.tsx`.

**Verify (manual, must be thorough):** add/remove line, change kind, toggle tax, quantity × price, preset insert, slash palette, revised totals, revised estimate in both receipt styles.

### 5.9 Receipt helpers (finding 12)

Both receipt files define `e`, `money`, `policy`, `hasDigitalSignature`. Share them via `src/receiptShared.ts` (built on `src/html.ts` from Phase 0).

**Verify:** regenerate the sample PDFs and diff visually against `docs/receipt-samples/`.

### 5.10 Settings draft object (finding 13, D4)

Deferred. If picked up later: one `draft` object + `patch()` in `SettingsView`, and `ShopTabProps` shrinks to `{ draft, patch, busy, onSave, saved }`.

---

## 9. Phase 6 — Verification

### Commands (every phase)

```bash
npm run typecheck   # exit 0
npm run lint        # exit 0
npm test            # 9 baseline + the 3 new suites from Phase 0
```

### Manual smoke pass (`npm start`)

| Area      | Checks                                                                         |
| --------- | ------------------------------------------------------------------------------ |
| Orders    | create, edit, duplicate, delete, status change, search, filters, sort          |
| Form      | customer autofill, switch vehicle, add address, notes, presets and `/` palette |
| Print     | Save & Print, Preview, Print blank order, Save PDF (both receipt styles)       |
| Email     | post-save prompt, row Email, Gmail test email, disconnect/reconnect            |
| Settings  | shop, taxes, presets reset, appearance themes, backup panel                    |
| Backup    | export JSON, export SQLite, import merge, import replace, export CSV           |
| Customers | select, edit contact, add vehicle, save & start order, history filter          |

Record the result per phase in the commit message.

---

## 10. Effort and risk

| Phase         | Items  | Est. net lines | Risk        | Manual UI test            |
| ------------- | ------ | -------------- | ----------- | ------------------------- |
| 0 Safety net  | 4      | +90            | Low         | No                        |
| 1 Defects     | 7      | +40            | Low–medium  | Yes (email, nav)          |
| 2 Dead code   | 7      | −420           | Low         | Yes (logo, presets, icon) |
| 3 Email stack | 5      | −550, −2 deps  | Medium      | Yes (send paths)          |
| 4 Persistence | 5      | −330           | Medium–high | Yes (settings, backup)    |
| 5 Renderer    | 9      | −430           | Medium      | Yes (form, receipts)      |
| **Total**     | **37** | **≈ −1,600**   |             |                           |

Phase 3 and Phase 4 carry the real risk: one removes a code path users may still be relying on through a stale build, the other changes how every setting is written. Both are gated by the round-trip and parity tests from Phase 0.

---

## 11. Traceability

### Simplification findings

| #   | Finding                       | Phase | Note                             |
| --- | ----------------------------- | ----- | -------------------------------- |
| 1   | Resend/SMTP stack             | 3     | D1                               |
| 2   | Logo showcase suite           | 2.1   |                                  |
| 3   | Unused loopback server        | 2.2   |                                  |
| 4   | Two settings stores           | 4.2   |                                  |
| 5   | 15 inline upserts             | 4.2   | resolved by 4.2                  |
| 6   | Second charge editor          | 5.8   | D3                               |
| 7   | Two email modals              | 5.7   | also fixes shared `emailSending` |
| 8   | Shop-defaults merge ×3        | 5.2   |                                  |
| 9   | Hand-written API declarations | 5.6   |                                  |
| 10  | Duplicate schema DDL          | 4.1   |                                  |
| 11  | View reset ×6                 | 5.3   |                                  |
| 12  | Receipt helper duplication    | 5.9   |                                  |
| 13  | Settings prop drilling        | 5.10  | deferred, D4                     |
| 14  | `applyDefaults` ×2            | 5.1   |                                  |
| 15  | Preset seed ×2                | 4.4   |                                  |
| 16  | `isOrderBeingFilled`          | 5.4   |                                  |
| 17  | Notice regex                  | 5.5   |                                  |
| 18  | Duplicate amount validator    | 4.3   |                                  |
| 19  | Unused exports                | 2.3   |                                  |
| 20  | Dead props / dead filter      | 2.6   |                                  |
| 21  | Icon probe                    | 2.5   |                                  |
| 22  | `status`/`vehicle` columns    | 2.7   | alternative to deletion, D2      |
| 23  | One-constant module           | 2.4   |                                  |

### Defects

| #   | Defect                              | Phase | Resolution                                        |
| --- | ----------------------------------- | ----- | ------------------------------------------------- |
| 1   | Post-save email hits Resend path    | 1.7   | fresh status + pure resolver; branch deleted in 3 |
| 2   | Cloud Console link uses `openPath`  | 1.1   | `shell.openExternal` IPC                          |
| 3   | Shop defaults lost after save       | 1.2   | pass `shopSettings`                               |
| 4   | Draft destroyed by navigation       | 1.3   | discard confirmation                              |
| 5   | `status` column never updated       | 2.7   | write it on create/update/set-status              |
| 6   | Form tax rate rewrites shop default | 1.4   | drop the upsert in `saveWorkOrder`                |
| 7   | Unescaped HTML in emails            | 1.5   | shared `escapeHtml`                               |
| 8   | "Connected" after failed refresh    | 1.6   | `needsReconnect` + banner                         |

---

## 12. Out of scope

- Tax math, rounding, receipt layout, or wording changes.
- Cloud sync / multi-PC (covered separately in `docs/CONVEX_SYNC_AND_RELEASE_PLAN.md`).
- Performance work (full-table JSON parsing on customer save, repeated `chargeTotals` calls).
- Security hardening beyond bug 7 (e.g. the `plain:` token fallback when `safeStorage` is unavailable).
- Deleting the orphaned `app_settings` email keys or the Gmail SMTP credentials users may have entered.
- Dropping the `status`/`vehicle` columns outright (D2 option b).

---

## 13. Rollback

Every phase is one commit and touches no user data:

- Phases 1–2 and 5: `git revert` is sufficient.
- Phase 3: revert restores the code path, but the uninstalled dependencies must be reinstalled (`npm install`) before the app builds again.
- Phase 4: revert is safe because the schema is unchanged; settings rows keep their existing keys.
- Before starting Phase 3 and Phase 4, take a real backup from Settings → Backup & Data → Save Backup (.json) so the shop's data can be restored regardless of code state.
