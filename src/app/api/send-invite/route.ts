import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM    = 'Zaans Licht Toernooi <noreply@zaanslicht.com>'
const REPLY_TO = 'zaanslicht@outlook.com'

export async function POST(req: NextRequest) {
  try {
    const { toEmail, toName, inviteUrl } = await req.json()

    if (!toEmail || !inviteUrl) {
      return NextResponse.json({ error: 'Missende velden' }, { status: 400 })
    }

    // Verifieer dat de aanvrager een geldig Supabase-sessie heeft (via de anon key + auth header)
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 })
    }
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { authorization: authHeader } } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 })

    const { data, error } = await resend.emails.send({
      from:     FROM,
      to:       toEmail,
      replyTo:  REPLY_TO,
      subject:  `${toName ? toName + ', j' : 'J'}e uitnodiging voor Zaans Licht Toernooi`,
      html: `
<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#111;font-family:Arial,Helvetica,sans-serif;color:#e5e5e5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#1a1a1a;border-radius:16px;overflow:hidden;border:1px solid #2a2a2a;">

        <!-- Header -->
        <tr>
          <td style="background:#FF6B00;padding:28px 32px;">
            <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#fff;opacity:0.8;">
              ⚽ Zaans Licht
            </p>
            <h1 style="margin:0;font-size:22px;font-weight:800;color:#fff;">
              Je toegang is goedgekeurd!
            </h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            ${toName ? `<p style="margin:0 0 16px;font-size:16px;">Hoi <strong>${toName}</strong>,</p>` : ''}
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#ccc;">
              Je aanvraag voor toegang tot het <strong style="color:#fff;">Zaans Licht Toernooisysteem</strong> is goedgekeurd.
              Klik op de knop hieronder om jouw account aan te maken.
            </p>

            <!-- CTA knop -->
            <table cellpadding="0" cellspacing="0" style="margin:28px 0;">
              <tr>
                <td style="background:#FF6B00;border-radius:10px;">
                  <a href="${inviteUrl}"
                     style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#fff;text-decoration:none;letter-spacing:0.3px;">
                    Account aanmaken →
                  </a>
                </td>
              </tr>
            </table>

            <!-- Info -->
            <table cellpadding="0" cellspacing="0" style="width:100%;background:#111;border-radius:10px;border:1px solid #2a2a2a;margin-bottom:24px;">
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#FF6B00;text-transform:uppercase;letter-spacing:1px;">
                    ⏱ Bèta-toegang
                  </p>
                  <p style="margin:0;font-size:13px;color:#999;line-height:1.5;">
                    Deze uitnodiging is <strong style="color:#ccc;">30 dagen geldig</strong>.
                    Na activering kun je direct toernooien aanmaken en beheren.
                  </p>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:12px;color:#555;line-height:1.6;">
              Werkt de knop niet? Kopieer en plak deze link in je browser:<br>
              <span style="color:#777;word-break:break-all;">${inviteUrl}</span>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#111;padding:20px 32px;border-top:1px solid #2a2a2a;">
            <p style="margin:0;font-size:12px;color:#444;text-align:center;">
              Zaans Licht · Toernooisysteem bèta · Vragen? Stuur een e-mail naar
              <a href="mailto:${REPLY_TO}" style="color:#666;">${REPLY_TO}</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ id: data?.id })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
