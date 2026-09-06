import type { APIRequestContext } from '@playwright/test'

const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025'

export interface MailpitMessage {
  ID: string
  Subject: string
  To: string[] | { Address: string }[]
}

function recipients(message: MailpitMessage): string[] {
  return (message.To ?? []).map((entry) =>
    typeof entry === 'string' ? entry : entry.Address,
  )
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Waits until a message addressed to `to` shows up in Mailpit and returns it.
 * Recipient filtering is client-side (each spec owns a unique address), so
 * parallel specs never steal each other's messages.
 */
export async function waitForMessage(
  request: APIRequestContext,
  to: string,
  timeoutMs = 30_000,
): Promise<MailpitMessage> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await request.get(`${MAILPIT_URL}/api/v1/messages`)
    const body = (await res.json()) as { messages?: MailpitMessage[] }
    const match = (body.messages ?? []).find((m) =>
      recipients(m).some((addr) => addr.toLowerCase() === to.toLowerCase()),
    )
    if (match) return match
    await sleep(500)
  }
  throw new Error(`No Mailpit message to <${to}> within ${timeoutMs}ms`)
}

/**
 * Extracts the first link from the message HTML whose target contains
 * `pathContains` (e.g. '/verify-tenant?token='), ready for page.goto().
 */
export async function extractLink(
  request: APIRequestContext,
  message: MailpitMessage,
  pathContains: string,
): Promise<string> {
  const res = await request.get(`${MAILPIT_URL}/api/v1/message/${message.ID}`)
  const body = (await res.json()) as { HTML?: string; Text?: string }
  const haystack = `${body.HTML ?? ''}\n${body.Text ?? ''}`.replace(/&amp;/g, '&')
  const link = haystack
    .match(/https?:\/\/[^\s"'<>]+/g)
    ?.find((url) => url.includes(pathContains))
  if (!link) {
    throw new Error(`No link containing "${pathContains}" in message ${message.ID}`)
  }
  return link
}

/** Clears the Mailpit queue (manual cleanup between local runs — NOT called by specs). */
export async function deleteAllMessages(request: APIRequestContext): Promise<void> {
  await request.delete(`${MAILPIT_URL}/api/v1/messages`)
}
