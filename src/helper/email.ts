import nodemailer, { Transporter } from "nodemailer";
import config from "../config";
import { logger } from "../utils/logger";

let transporter: Transporter | null | undefined;

const getTransporter = () => {
  if (transporter !== undefined) return transporter;
  const { host, port, user, pass } = config.smtp;
  transporter =
    host && user && pass
      ? nodemailer.createTransport({ host, port: port || 587, secure: port === 465, auth: { user, pass } })
      : null;
  return transporter;
};

export const isEmailEnabled = () => Boolean(getTransporter());

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Fire-and-forget email. Never throws and never blocks the request that triggered it;
 * failures are logged. When SMTP is not configured the email is skipped (logged at debug).
 */
export const sendEmail = (to: string, subject: string, text: string, link?: string) => {
  const t = getTransporter();
  if (!t) {
    logger.debug("Email skipped (SMTP not configured)", { to, subject });
    return;
  }
  const url = link ? (link.startsWith("http") ? link : `${config.client_url}${link}`) : undefined;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
  <h2 style="color:#0e7490;margin-top:0">${escapeHtml(subject)}</h2>
  <p style="color:#111827;line-height:1.6">${escapeHtml(text)}</p>
  ${url ? `<p><a href="${escapeHtml(url)}" style="background:#0e7490;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open in Health Care</a></p>` : ""}
  <p style="color:#6b7280;font-size:12px">You received this because you have an account on Health Care.</p></div>`;
  t.sendMail({ from: config.smtp.from, to, subject, text: url ? `${text}\n\n${url}` : text, html }).catch((err: Error) =>
    logger.error("Email delivery failed", { to, subject, err })
  );
};
