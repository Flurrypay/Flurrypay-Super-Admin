# Database domain map

Source: read-only inspection of `api/src/migrations/*` (all 37 files) and `api/src/app/models/*` (81 files), September 2026.

## How the schema is actually managed

`api/src/core/database/database.ts` configures TypeORM with **`synchronize: true`** on PostgreSQL. The live schema is therefore derived from the **entity models** on every boot. The migrations are a partial history:

- `InitialSchema` creates 36 tables. Later migrations add columns, indexes and a few tables. Most tables in the models (e.g. `transactions`, `admin_audit_logs`, all compliance and risk tables) have **no migration at all**; they exist only because of `synchronize`.
- Several migrations were superseded by model changes. For example, `AddReferralSystem` created six tables that `RebuildReferralSystem` later dropped; `AddLockedBalance` → `DropLockedBalance`; `EnforceSingleAdmin` → `AllowMultipleAdmins`.
- Constraints created **only** by migrations, and absent from the models, survive only as long as `synchronize` doesn't drop them. Examples: `UQ_users_phoneNumber_not_null`, `UQ_commission_per_trade`, the partial unique index on `referral_reward`.
- Migrations and models disagree on some defaults, e.g. `kyc_profiles.currentLevel` (migration 1, model 0) and `dailyWithdrawalLimit` (migration 200000, model 50000).

The admin UI therefore treats the **models as the source of truth** for columns and enums, and the migrations as evidence of intent and history.

**Totals:** 76 entities registered in the DataSource. Three SafeHaven entities are disabled (`SAFEHAVEN_DISABLED`). Relationship decorators: 42 `ManyToOne`, 6 `OneToOne`, 22 `OneToMany`, plus many **unconstrained** `userId` / `adminId` string columns that reference other tables by convention only.

## Conventions observed

| Aspect       | Observation                                                                                                                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary keys | UUID everywhere (`uuid_generate_v4()` / `gen_random_uuid()`).                                                                                                                                                                                                                                                       |
| Timestamps   | Mostly `timestamp` **without time zone**; newer tables use `timestamptz`. Correct UTC display depends on the API server running in UTC.                                                                                                                                                                             |
| Soft delete  | Only `users.deletedAt` (a plain column, not `@DeleteDateColumn`).                                                                                                                                                                                                                                                   |
| Money        | Mixed: `decimal(p,s)` of varying precision, `bigint` kobo (`referral_*`), `varchar` (`userWallet.balance`, `cryptoTransactionHistory.amount`), and **`float`** (`userAssets.balance`). Entity transformers convert decimals to JS `number` before JSON serialisation, so exact values are lost at the API boundary. |
| Enums        | Postgres enums for some columns, plain `varchar` with a TS enum for others (`admin_audit_logs.action`, `broadcasts.status`).                                                                                                                                                                                        |
| Foreign keys | Constrained on older tables; many newer tables store `userId`/`adminId` without an FK constraint.                                                                                                                                                                                                                   |

## Domains

```text
IDENTITY & ACCESS (end users)
├── users                    hub entity; status flags, balances, KYC booleans, lockouts
├── user_extras              1:1 temp 2FA secret
├── user_devices             trusted-device registry (TRUSTED | PENDING_VERIFICATION | REVOKED)
├── biometric_credentials    device public keys (Face ID)
├── userCodes, twoFACodes    one-time codes (sensitive — never surfaced)
├── user_activity_logs       45 action types: logins, security changes, KYC, money movement
└── photos                   profile photos

KYC / VERIFICATION
├── kyc_profiles             1:1 users; level1–3 status (NOT_STARTED|PENDING|VERIFIED|REJECTED|EXPIRED), limits
├── liveness_sessions        PENDING|PASSED|FAILED|ABANDONED|UNAVAILABLE
├── govt_id_photos           document images
└── kyc_provider_config      active provider + Dojah credentials (secret — never surfaced)

COMPLIANCE & RISK (AML)
├── compliance_profiles      risk rating LOW|MEDIUM|HIGH, PEP status, source of funds, EDD
├── compliance_alerts        11 monitoring rules; severity; OPEN|UNDER_REVIEW|CLEARED|ESCALATED|REPORTED
├── compliance_cases         OPEN|AWAITING_CUSTOMER|UNDER_REVIEW|CLEARED|CONFIRMED|CLOSED; held funds
├── suspicious_activity_reports  STR|CTR; INTERNAL_ESCALATION → … → FILED (NFIU reference)
├── risk_assessments         per-event score + action (ALLOW … FREEZE_ACCOUNT)
├── behaviour_profiles       per-user baselines
└── fund_holds               ACTIVE|RELEASED|CONFISCATED

MONEY — USER LEDGER
├── transactions             unified ledger: 13 types × 6 statuses; fees, failure + reversal trail
├── wallet_ledger            CREDIT|DEBIT with balanceBefore/After (reconciliation source)
├── wallet_debts             outstanding naira owed by a user
├── moneyTransactions        legacy fiat ledger; isManualCredit / isManualDebit
├── pending_transactions     legacy
├── cryptoTransactionHistory legacy crypto history (varchar amounts)
├── cryptoTransactions       admin/user crypto movement records
├── swapped_transactions     swaps (also mapped by adminSwapHistory entity)
├── queued_orders            trade queue: QUEUED|RESERVED|SETTLING|SETTLED|RETURNED
├── service_fee_logs         withdrawal fees and Nomba charges
└── record_pending_crypto_transactions, buy_from_admin_tracker, sell_to_admin_tracker  (OTC flows)

WALLETS & ACCOUNTS
├── userWallet               per-currency deposit address + cached balances (varchar)
├── userAssets               per-coin balance (float — imprecise)
├── nomba_virtual_accounts   1:1 users; NUBAN; retired/replaced lineage
├── bank_beneficiaries, fiat_beneficiaries, crypto_beneficiaries
└── safe_haven_* (disabled)

PAYMENTS / BILLS
├── transactions             AIRTIME_PURCHASE, DATA_PURCHASE, ELECTRICITY_BILL, CABLE_SUBSCRIPTION
├── utility_history (disabled SafeHaven)
└── save_*_plans             provider catalogue caches

TREASURY (company funds)
├── admin_earnings           per-trade profit (naira), rate, strategy
├── admin_transfer_history   company bank movements; Inwards|Outwards; 8 transfer types
├── adminWallet              company crypto wallets
├── admin_coin_conversion, admin_ledger_adjustment, pending_swap_fee_collection  (background jobs)
├── payout_provider_config   payout rails incl. apiKey/webhookSecret (secret — never surfaced)
└── companyDetails           rates: buy/sell markup, swap fee, admin buy/sell rate

REFERRALS & COMMISSION
├── referral_link, referral_reward   (kobo bigint)
└── commission_relationships, commission_history, commission_withdrawals

ENGAGEMENT
├── broadcasts (18 audiences, EMAIL|PUSH|EMAIL_AND_PUSH), campaigns, campaign_interactions
├── in_app_banners, app_version_config, user_notifications, userWatchList

SUPPORT
├── appeal, contact_message  (status + jsonb replies), chatRoom, chatMessages, reportBug

ADMINISTRATION
├── admin                    role (admin|executive|superAdmin), permissions jsonb, 2FA, PIN, device hashes, suspension
├── adminCodes               login / device-verification codes
├── admin_audit_logs         32 enumerated actions + metadata/IP/user agent
└── admin_notifications      type, priority, targetRole, read state

CAREERS (out of scope for operations)
└── job_postings, job_applications
```

## Tables most relevant to administration

| Table                                                   | Key business fields                                                                                                                                                                                           | Important enums                                                                              | Relationships              | Admin relevance                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------- |
| `users`                                                 | email, userName, phone, level, walletBalance, referralBalance, isBlocked/reasonForBlock, isSuspended/suspensionReason, outboundRestricted, pin/login lockouts, lastLogin, lastLoginIp, totalTransactionVolume | `BlockReason`: too_many_incorrect_pin, too_many_incorrect_password, blocked_by_admin         | hub for almost every table | User management, account status, lockouts, KYC level |
| `kyc_profiles`                                          | level1–3 status/reason/timestamps, BVN/NIN (**plain varchar**), verified identity fields, address, government ID, face match, limits                                                                          | `VerificationStatus`, `GovernmentIDType`                                                     | 1:1 users (CASCADE)        | KYC review queue, limits                             |
| `transactions`                                          | type, status, amount/currency, from/to, fee, reference (unique), externalId, provider, addresses, hash, network, failure*, reversal*                                                                          | `TransactionType` (13), `TransactionStatus` (6), `CurrencyType`                              | N:1 users                  | Transactions, failures, reversals                    |
| `wallet_ledger`                                         | direction, amountNaira, balanceBefore/After, source, reference                                                                                                                                                | `LedgerDirection`                                                                            | userId (no FK)             | Reconciliation, statements                           |
| `admin`                                                 | role, permissions, isSuspended, mustResetPassword, hasActivated2FA, phone, deviceIdentifiers                                                                                                                  | `AdminRole`                                                                                  | 1:N adminCodes, wallets    | Administrator management                             |
| `admin_audit_logs`                                      | adminId, adminEmail, action, metadata, ipAddress, userAgent                                                                                                                                                   | `AdminAuditAction` (32; additional free-form values are written, e.g. `USER_ACCOUNT_FROZEN`) | adminId (no FK)            | Audit trail                                          |
| `admin_notifications`                                   | title, body, type, priority, targetRole, read/readAt/readBy                                                                                                                                                   | type, priority, targetRole                                                                   | —                          | Notification centre                                  |
| `compliance_alerts` / `compliance_cases` / `fund_holds` | severity, status, evidence, held amounts                                                                                                                                                                      | see above                                                                                    | userId                     | Operations / compliance queues                       |
| `user_activity_logs`                                    | action, ipAddress, deviceInfo, location                                                                                                                                                                       | `UserActivityAction` (45)                                                                    | userId (no FK)             | User security timeline                               |

## Status vocabularies used by the UI

The UI maps only these real values. There are no invented statuses.

- `transactions.status`: PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED, REVERSED
- `kyc_profiles.levelNStatus`: NOT_STARTED, PENDING, VERIFIED, REJECTED, EXPIRED
- User account state: derived from `isBlocked`, `isSuspended`, `outboundRestricted`, `isConfirmed`, `deletedAt`
- Admin account state: derived from `isSuspended`, `mustResetPassword`, `hasActivated2FA`
