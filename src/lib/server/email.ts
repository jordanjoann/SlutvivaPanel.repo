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
    subject: "Your Slutvival Panel login",
    text: [
      "A Slutvival Panel account has been created for you.",
      "",
      `Login: ${input.loginUrl}`,
      `Username: ${input.username}`,
      `Role: ${input.role}`,
      `Starting PIN: ${input.pin}`,
      "",
      "Sign in and change your PIN from Account settings.",
    ].join("\n"),
    html: [
      "<p>A Slutvival Panel account has been created for you.</p>",
      `<p><a href="${escapeHtml(input.loginUrl)}">Open Slutvival Panel</a></p>`,
      "<ul>",
      `<li><strong>Username:</strong> ${escapeHtml(input.username)}</li>`,
      `<li><strong>Role:</strong> ${escapeHtml(input.role)}</li>`,
      `<li><strong>Starting PIN:</strong> ${escapeHtml(input.pin)}</li>`,
      "</ul>",
      "<p>Sign in and change your PIN from Account settings.</p>",
    ].join(""),
  };
}

export function buildPinResetEmail(input: { resetUrl: string; expiresAt: Date }) {
  const expiry = input.expiresAt.toISOString();
  return {
    subject: "Reset your Slutvival Panel PIN",
    text: [
      "A PIN reset was requested for the Slutvival Panel.",
      "",
      `Reset link: ${input.resetUrl}`,
      "",
      `This link expires at ${expiry}.`,
      "If you did not request this, ignore this email.",
    ].join("\n"),
    html: [
      "<p>A PIN reset was requested for the Slutvival Panel.</p>",
      `<p><a href="${escapeHtml(input.resetUrl)}">Reset your PIN</a></p>`,
      `<p>This link expires at <strong>${escapeHtml(expiry)}</strong>.</p>`,
      "<p>If you did not request this, ignore this email.</p>",
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
  input: { to: string; resetUrl: string; expiresAt: Date },
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
