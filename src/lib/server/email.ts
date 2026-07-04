import { Resend } from "resend";
import type { PanelRole } from "./panel-users";

export type EmailEnv = Record<string, string | undefined>;

export type EmailConfig = {
  apiKey: string;
  from: string;
  publicUrl: string;
};

export type OutgoingEmail = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type EmailTransport = {
  send(email: OutgoingEmail): Promise<void>;
};

export function readEmailConfig(env: EmailEnv = process.env): EmailConfig | null {
  const apiKey = optionalTrimmed(env.RESEND_API_KEY);
  const from = optionalTrimmed(env.PANEL_EMAIL_FROM);
  const publicUrl = normalizePublicUrl(optionalTrimmed(env.PANEL_PUBLIC_URL));
  const values = [apiKey, from, publicUrl];

  if (values.every((value) => !value)) return null;
  if (values.some((value) => !value)) {
    throw new Error("Panel email configuration is incomplete.");
  }

  return { apiKey: apiKey!, from: from!, publicUrl: publicUrl! };
}

export function requireEmailConfig(env: EmailEnv = process.env): EmailConfig {
  const config = readEmailConfig(env);
  if (!config) throw new Error("Panel email is not configured.");
  return config;
}

export function createResendTransport(apiKey: string): EmailTransport {
  const resend = new Resend(apiKey);
  return {
    async send(email) {
      const { error } = await resend.emails.send({
        from: email.from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      if (error) throw new Error(error.message || "Resend rejected the email.");
    },
  };
}

export function buildWelcomeEmail(input: {
  loginUrl: string;
  username: string;
  role: PanelRole;
  pin: string;
}) {
  return {
    subject: "Welcome to Slutvival",
    text: [
      "Welcome to the Slutvival team!",
      "",
      `Visit ${input.loginUrl} to gain access to your account.`,
      `Username: ${input.username}`,
      `PIN: ${input.pin}`,
    ].join("\n"),
    html: [
      emailShell([
        '<h1 style="margin:0 0 18px;font-size:24px;line-height:1.2;color:#111827;">Welcome to the Slutvival team!</h1>',
        `<p style="margin:0 0 20px;color:#374151;">Visit <a href="${escapeHtml(input.loginUrl)}" style="color:#7c3aed;text-decoration:none;">${escapeHtml(input.loginUrl)}</a> to gain access to your account.</p>`,
        detailRow("Username", input.username),
        detailRow("PIN", input.pin),
      ].join("")),
    ].join(""),
  };
}

export function buildPinResetEmail(input: { username: string; resetUrl: string; expiresAt: Date }) {
  return {
    subject: "Reset your Slutvival PIN",
    text: [
      `Hey ${input.username}!`,
      "",
      "You seem to have forgotten your PIN. Click the link below to set a new one.",
      "",
      input.resetUrl,
      "",
      "This link expires in 24 hours and can only be used once.",
    ].join("\n"),
    html: [
      emailShell([
        `<h1 style="margin:0 0 18px;font-size:24px;line-height:1.2;color:#111827;">Hey ${escapeHtml(input.username)}!</h1>`,
        '<p style="margin:0 0 22px;color:#374151;">You seem to have forgotten your PIN. Click the link below to set a new one.</p>',
        `<p style="margin:0 0 22px;"><a href="${escapeHtml(input.resetUrl)}" style="display:inline-block;border-radius:8px;background:#7c3aed;color:#ffffff;padding:12px 18px;text-decoration:none;font-weight:700;">Reset PIN</a></p>`,
        '<p style="margin:0;color:#6b7280;font-size:13px;">This link expires in 24 hours and can only be used once.</p>',
      ].join("")),
    ].join(""),
  };
}

export async function sendWelcomeEmail(
  input: { to: string; loginUrl: string; username: string; role: PanelRole; pin: string },
  config: EmailConfig = requireEmailConfig(),
  transport: EmailTransport = createResendTransport(config.apiKey),
) {
  const content = buildWelcomeEmail(input);
  await transport.send({ from: config.from, to: input.to, ...content });
}

export async function sendPinResetEmail(
  input: { to: string; username: string; resetUrl: string; expiresAt: Date },
  config: EmailConfig = requireEmailConfig(),
  transport: EmailTransport = createResendTransport(config.apiKey),
) {
  const content = buildPinResetEmail(input);
  await transport.send({ from: config.from, to: input.to, ...content });
}

function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function normalizePublicUrl(value: string | undefined): string | undefined {
  return value?.replace(/\/+$/, "");
}

function emailShell(content: string): string {
  return [
    '<div style="margin:0;background:#f8fafc;padding:24px;font-family:Arial,Helvetica,sans-serif;">',
    '<div style="max-width:520px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;padding:28px;">',
    content,
    "</div>",
    "</div>",
  ].join("");
}

function detailRow(label: string, value: string): string {
  return [
    '<div style="margin:0 0 10px;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;background:#f9fafb;">',
    `<div style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.04em;">${escapeHtml(label)}</div>`,
    `<div style="color:#111827;font-size:18px;font-weight:700;">${escapeHtml(value)}</div>`,
    "</div>",
  ].join("");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
