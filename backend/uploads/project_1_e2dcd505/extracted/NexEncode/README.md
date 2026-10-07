# NexEncode — Demo Payments, Analytics & Billing Edition

NexEncode is a Node.js, Express, MySQL, Socket.io and FFmpeg video encoder. This edition adds account administration, premium controls, email verification, password recovery, analytics, notifications, file retention and invoices.

## New features

- Admin dashboard with platform statistics and charts
- Monthly revenue and subscription report with CSV export
- Email verification and password reset through SMTP/Nodemailer
- Development verification/reset links when SMTP is not configured
- Conversion history with download counts and expiry status
- Premium badge beside usernames
- Automatic output deletion after 24 hours by default
- Database and browser notifications when encoding completes or fails
- User dashboard activity chart
- Dark/light mode saved in the browser
- Demo Credit Card, Debit Card, UPI, Net Banking and Wallet checkout
- Payment records and downloadable PDF invoices
- Groq assistant no longer crashes the server when `GROQ_API_KEY` is empty

## Upgrade an existing NexEncode installation

Back up your database and project first.

### 1. Import the database upgrades

If you have already imported `upgrade_admin_premium.sql`, import only:

```text
server/db/upgrade_platform_features.sql
```

In phpMyAdmin:

1. Start Apache and MySQL in XAMPP.
2. Open `http://localhost/phpmyadmin`.
3. Select the `video_encoder` database.
4. Choose **Import**.
5. Select `server/db/upgrade_platform_features.sql`.
6. Click **Go**.

For a completely new database, import `server/db/schema.sql` instead.

The platform migration marks existing accounts as email verified, so current users are not locked out.

### 2. Install dependencies

```cmd
cd C:\Projects\NexEncode_Admin_Premium
npm install
```

### 3. Configure `.env`

Copy `.env.example` to `.env`. Keep your existing database and JWT values.

Important settings:

```env
APP_BASE_URL=http://localhost:3000
EMAIL_VERIFICATION_REQUIRED=true
OUTPUT_RETENTION_HOURS=24
CLEANUP_INTERVAL_MINUTES=30
```

## Gmail SMTP setup

For local development, Gmail SMTP can be used with a Google App Password:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-character-app-password
MAIL_FROM=NexEncode <your-email@gmail.com>
```

Do not place your normal Gmail password in `.env`. If SMTP is empty, registration and forgot-password responses display a development link that works on localhost.

## Create or update the admin account

```cmd
npm run admin:create -- admin@example.com admin StrongPassword123
```

## Start NexEncode

```cmd
npm run dev
```

Open:

```text
User application: http://localhost:3000
Admin dashboard: http://localhost:3000/admin.html
```

## Testing checklist

### Email verification

1. Register a new account.
2. Open the verification email or development link.
3. Sign in after verification.

### Password reset

1. Select **Forgot password?** on the login screen.
2. Open the email or development reset link.
3. Create a new password and sign in.

### Completion notifications

1. Upload and encode a small test video.
2. Keep the dashboard open.
3. The completion toast and notification bell should update.
4. Enable browser notifications from the notification menu if desired.

### Auto-delete test

Temporarily set:

```env
OUTPUT_RETENTION_HOURS=1
CLEANUP_INTERVAL_MINUTES=5
```

After the output expires, history displays **Expired**, and downloading returns an expiry message.

### Demo Premium checkout

1. Sign in with a free user account.
2. Open **Premium** from the user dashboard.
3. Choose Credit Card, Debit Card, UPI, Net Banking, or Wallet.
4. Use the test values displayed in the checkout.
5. Enter the demo OTP `123456`.
6. Premium is activated for the configured number of days.
7. A payment record and PDF invoice are generated automatically.

This is a project simulation. It does not connect to a payment gateway, transfer money, or store card numbers, CVV, UPI PINs, bank passwords, or wallet credentials.

### Manual Premium grant

The admin can still grant Premium manually. Enter an amount above zero to generate an invoice, or enter `0` for a free grant.

## Revenue behavior

Only records in the `payments` table with status `paid` are included in revenue charts and reports. Free manual Premium grants with amount `0` do not count as revenue.

## Output retention

Completed output files receive an expiry time. A cleanup task runs periodically and deletes expired output files while preserving job history and statistics in MySQL.

## Optional services

### Groq AI assistant

```env
GROQ_API_KEY=
```

The main project runs even when this value is empty. The assistant returns a disabled message instead of crashing the server.

### Demo payment configuration

```env
PREMIUM_PRICE_INR=199
DEMO_PAYMENT_ENABLED=true
DEMO_PAYMENT_OTP=123456
DEMO_PREMIUM_DAYS=30
```

The included checkout is intentionally a local simulation for demonstrations. No ngrok, KYC, API key, webhook, or hosted payment gateway is required. When the project is ready for production, replace the `/api/subscription/demo-pay` route with a verified payment provider integration.

## Security notes

- Verification and reset tokens are stored as SHA-256 hashes, not raw tokens.
- Passwords are hashed using bcrypt.
- Download and invoice routes check the authenticated owner.
- Upload limits are enforced on the server.
- Blocked accounts are rejected on API and Socket.io connections.
- SMTP, JWT and demo configuration belong only in `.env`; never commit `.env`.
- Never use the demo checkout to collect real payment credentials.

---

## Modern UI redesign

This edition includes a complete visual redesign of the authentication page, encoder dashboard, history drawer, Premium dialog, notifications, and admin analytics dashboard.

### Design changes

- High-contrast light theme with clearly visible cards, borders, controls, labels, tables, and chart surfaces.
- Refined dark theme using neutral surfaces and restrained indigo/blue accents instead of a strong neon treatment.
- Responsive navigation sidebar on desktop and an animated mobile drawer on smaller screens.
- Bento-style dashboard metrics and larger analytics chart surfaces.
- Modern upload drop zone, segmented codec/resolution controls, sliders, toggles, buttons, modals, and data tables.
- Subtle reveal, hover spotlight, upload float, button ripple, spinner, toast, drawer, and form transition animations.
- `prefers-reduced-motion` support for users who disable animations at operating-system level.
- Updated login/register/recovery layout with a product preview panel.
- SVG interface icons in place of most emoji-based controls.
- Existing API endpoints, element IDs, upload logic, encoding logic, notifications, account management, charts, and billing functionality were preserved.

### New front-end files

```text
public/css/modern.css
public/css/auth-modern.css
public/js/modern-ui.js
```

No additional npm package is required for the redesign. Run the project normally:

```cmd
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
http://localhost:3000/dashboard.html
http://localhost:3000/admin.html
```

## Small UI refinement update

This build also includes the following layout adjustments:

- The **Download encoded video** action now matches the **Start Encoding** button in width and height.
- The assistant message area expands correctly, removing the large unused gap below the input composer.
- The desktop authentication page is vertically compacted to fit common laptop screens without page scrolling; mobile remains scrollable.

## Viewport-fit login update

The desktop login page now uses height-aware typography and a three-row grid layout. The brand, full hero message, description, complete recent-workflow card, login form, and footer remain visible within common laptop browser viewports without page or card scrolling. Mobile layouts remain scrollable for accessibility.

## Latest UI correction

The authentication showcase now keeps the complete four-line headline, description, and recent-workflow card visible at the same time. The extra space above the local-workspace status pill has also been reduced. No database or dependency changes are required.

## Left showcase spacing update

The desktop login showcase now uses more balanced spacing between the brand, status indicator, heading, supporting description, and recent-workflow card. The right-side login panel was not changed.

## Latest left showcase adjustment

The left authentication showcase now uses larger typography and a taller workflow preview. On common laptop and desktop viewport heights, the workflow card extends slightly below the login card level. The right login panel was not modified.
