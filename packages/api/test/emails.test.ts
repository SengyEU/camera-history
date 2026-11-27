import { describe, expect, it } from "vitest";
import { contactEmail } from "../src/emails/contact.js";
import { passwordResetEmail } from "../src/emails/password-reset.js";
import { verificationEmail } from "../src/emails/verification.js";
import { welcomeEmail } from "../src/emails/welcome.js";

const link = "https://camera-history.com/admin/#/verify-email?token=preview-token";

describe("email templates", () => {
  it("renders a branded verification email with text and HTML", () => {
    const message = verificationEmail("Alpine <Resort>", link, 24);

    expect(message.subject).toContain("Confirm your email");
    expect(message.text).toContain("Alpine <Resort>");
    expect(message.text).toContain(link);
    expect(message.html).toContain("<!doctype html>");
    expect(message.html).toContain("Verify email");
    expect(message.html).toContain(link);
    expect(message.html).toContain("Alpine &lt;Resort&gt;");
    expect(message.html).not.toContain("<Resort>");
    expect(message.html).toContain("This link expires in 24 hours");
    expect(message.html).toContain("support@camera-history.com");
    expect(message.html).not.toContain("Jílovská");
    expect(message.html).not.toContain("<img");
    expect(message.html).not.toContain("marek@");
  });

  it("renders a welcome email with concrete next steps", () => {
    const message = welcomeEmail("Alpine Resort", "https://camera-history.com/admin/");

    expect(message.text).toContain("Welcome to Camera History, Alpine Resort.");
    expect(message.html).toContain("Welcome, Alpine Resort");
    expect(message.html).toContain("Add your first camera");
    expect(message.html).toContain("Choose the schedule");
    expect(message.html).toContain("Embed the widget");
    expect(message.html).toContain("Open your workspace");
    expect(message.html).toContain("https://camera-history.com/admin/");
  });

  it("renders a password reset email with the expiry note", () => {
    const message = passwordResetEmail(
      "Alpine Resort",
      "https://camera-history.com/admin/#/reset-password?token=preview-token",
      60,
    );

    expect(message.subject).toBe("Reset your Camera History password");
    expect(message.html).toContain("Choose a new password");
    expect(message.html).toContain("This link expires in 60 minutes");
    expect(message.html).toContain("Your password stays the same");
  });

  it("escapes contact form values and keeps line breaks", () => {
    const message = contactEmail({
      name: "Jan <b>Novák</b>",
      email: "jan@example.com",
      topic: "A camera & setup",
      website: "https://example.com/?a=1&b=2",
      cameras: "2-3",
      message: "Line one\nLine two <script>alert(1)</script>",
    });

    expect(message.subject).toContain("A camera & setup");
    expect(message.text).toContain("Line two <script>alert(1)</script>");
    expect(message.html).toContain("Jan &lt;b&gt;Novák&lt;/b&gt;");
    expect(message.html).toContain("A camera &amp; setup");
    expect(message.html).toContain("Line one<br />Line two &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("mailto:jan%40example.com");
    expect(message.html).toContain("https://example.com/?a=1&amp;b=2");
    expect(message.html).toContain("Reply to Jan &lt;b&gt;Novák&lt;/b&gt;");
    expect(message.html).not.toContain("Button not working?");
  });
});
