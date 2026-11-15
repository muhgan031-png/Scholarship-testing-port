# Scholarship Portal - TEST VERSION

Everything is in this one zip. Nothing to install. Follow the steps in order.

## What is inside

| File | What it is |
|---|---|
| index.html + app.js | The public site and the applicant side (home page, sign up, form, uploads, status) |
| admin.html + admin.js | Private admin page (review, approve/reject, CSV download) |
| config.js | The ONLY file you edit: your keys, scholarship name, rules, documents |
| style.css | Look and feel |
| setup.sql | Builds the database, security and private file storage |

## What the portal does

- Applicants create an account, fill the form, save a draft and continue later.
- They upload documents (JPG, PNG or PDF, max 2 MB; big phone photos are shrunk automatically). Files are private.
- They submit and get a reference number like `SCH-2026-000001`. Clicking submit twice cannot create two numbers.
- They log in any time to see their status and your messages.
- You review applications, open documents (private links that expire in 10 minutes), approve, reject, waitlist or ask for more information, and download a CSV.
- Every decision is written to an audit log.

## Step 1 - Supabase (database, login, files)

1. Go to supabase.com, create a free account and press **New project**. Pick the closest region on offer and save the database password somewhere safe.
2. Open **SQL Editor**, press **New query**, paste everything from `setup.sql`, press **Run**. It should say success.
3. Open **Authentication** and find the Email sign-in settings. For this TEST turn **off** "Confirm email" so you can sign up without waiting for emails. (The built-in email sender is very limited. See "Before going live".)
4. Open **Project Settings > API**. Copy the **Project URL** and the **anon public** key.
   Never use or share the **service_role** key.

## Step 2 - Put your keys in config.js

Open `config.js` in any text editor and replace the two PASTE lines with your URL and anon key. While you are there, change the scholarship name, organisation, eligibility rules, documents list and contact.

If you change the required documents, the same list is inside `submit_application` in `setup.sql` (the `required_docs` line). Keep both the same, then run that SQL again.

## Step 3 - Put the site online (free)

Option A - Cloudflare Pages (direct upload):
1. Create a free Cloudflare account, open **Workers & Pages**, **Create**, **Pages**, **Upload assets**.
2. Upload the unzipped files (all of them, `index.html` at the top level). Press **Deploy**.
3. You get a link ending in `.pages.dev`. That is your test website. Admin page: add `/admin.html` to the end.

Option B - GitHub Pages: create a GitHub repository, upload all the files, then Settings > Pages > deploy from the main branch.

After the site has a link, go back to Supabase > **Authentication > URL Configuration** and set the **Site URL** to that link (needed for password-reset emails).

## Step 4 - Make yourself admin

1. On the live site press **Apply**, then **Create account** with your email.
2. In Supabase SQL Editor, open the last line of `setup.sql` (the one starting with `-- insert into public.admins`), put your email in, remove the `-- `, and run only that line.
3. Open `/admin.html` and log in.

## Step 5 - Test it (use fake data!)

1. Create a second test account in another browser or a private tab.
2. Fill the form, upload four small files, submit. Check you get a reference number.
3. In the admin page, open it, view a document, press "Ask for more info" with a message.
4. Back as the applicant: the message shows, you can edit and submit again. The reference number stays the same.
5. Approve it and check the applicant sees "Approved".
6. Download the CSV and open it.
7. Try breaking things: submit with a missing document (should be refused), open admin.html as the second account (should say not an administrator).

## Changing the deadline

Run this in the SQL Editor:

```
update public.app_settings set closes_at = '2027-06-30 23:59:00+01' where id = 1;
```

## Before going live (not part of this test)

- Turn "Confirm email" back on and connect a proper email sender (Resend with your own domain) in Supabase Authentication > SMTP. Resend's free plan allows 100 emails a day, so check that against your applicant numbers.
- Upgrade Supabase to Pro (about $25/month) a few days before applications open so the project never pauses. Keep the spend cap on.
- Buy your domain (about $10-11 a year at Cloudflare) and attach it to the Pages site.
- Add your real privacy policy and declaration wording (Nigeria Data Protection Act 2023) in `config.js`.
- Set `TEST_MODE` to false.
- Add bot protection (Cloudflare Turnstile) on sign-up, and turn on admin two-factor sign-in.
- There is no virus scanning on uploads. Files are limited to JPG, PNG and PDF, stay private, and admins open them through short-lived links. Tell your admins to open files only from this admin page.
- Do a real test with a few trusted people and your expected applicant numbers first.

## Known limits of this test build

- One application per account, one decision-maker role (admin). Separate reviewer and approver roles can be added later.
- Applicants cannot edit after submitting, unless you press "Ask for more info".
- No emails are sent by the portal itself yet (status is shown on the applicant's page).
