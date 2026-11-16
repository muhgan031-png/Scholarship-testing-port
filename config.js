// ============================================================
// SCHOLARSHIP PORTAL - SETTINGS (edit this file only)
// ============================================================
window.PORTAL = {

  // Shows a yellow "TEST VERSION" bar. Set to false for the real portal.
  TEST_MODE: true,

  // From Supabase > Project Settings > API
  // Paste the Project URL and the "anon public" key.
  // NEVER paste the "service_role" key here.
  SUPABASE_URL: "https://ekrdeodzshywtvuasrkg.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_3U2WMGfeustHjn8__m09iw_wetUET9E",

  // ---- What visitors see on the home page ----
  name: "Sample Scholarship 2026",
  organisation: "Sample Organisation",
  about:
    "This is a sample scholarship used to test the portal. Replace this text with a short description of the real scholarship and who it helps.",

  eligibility: [
    "Must be a full-time student of a recognised institution",
    "Must be a Nigerian citizen",
    "Must have a valid admission letter and student ID",
    "Must apply before the deadline shown above",
  ],

  // Documents applicants must upload.
  // "key" must stay simple (letters and underscores).
  // Required documents here must match the list inside the
  // submit_application function in setup.sql.
  documents: [
    { key: "passport_photo",   label: "Passport photograph",       required: true },
    { key: "admission_letter", label: "Admission letter",          required: true },
    { key: "student_id",       label: "Student ID card",           required: true },
    { key: "academic_result",  label: "Latest academic result",    required: true },
    { key: "other",            label: "Other supporting document", required: false },
  ],

  declaration:
    "I declare that the information I have given is true and complete. I understand that false information can lead to my application being rejected. I agree that the organisation may use my information only to process this scholarship.",

  faq: [
    { q: "How many applications can I send?", a: "One application per account." },
    { q: "What file types can I upload?", a: "JPG, PNG or PDF, up to 2 MB each. Large photos are shrunk automatically." },
    { q: "Can I continue later?", a: "Yes. Save your draft, log out, and log in again to continue." },
    { q: "How will I know the result?", a: "Log in and open My application. Your status and any message from the reviewers appear there." },
  ],

  contact: "scholarship@example.com",
};
