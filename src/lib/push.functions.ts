import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const tokenSchema = z.object({
  token: z.string().min(10),
  label: z.string().max(200).optional(),
});

export const saveDeviceToken = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => tokenSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from('device_tokens')
      .upsert(
        { user_id: context.userId, token: data.token, label: data.label ?? null, platform: 'web' },
        { onConflict: 'token' },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const reminderSchema = z.object({
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(200),
});

/** Sends a reminder push to every device this person has registered. */
export const sendReminder = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reminderSchema.parse(input))
  .handler(async ({ data, context }) => {
    const lovableApiKey = process.env['LOVABLE_API_KEY'];
    const connectionKey = process.env['FIREBASE_MESSAGING_API_KEY'];
    if (!lovableApiKey || !connectionKey) throw new Error('Reminders are not configured yet.');

    const { data: devices, error } = await context.supabase
      .from('device_tokens')
      .select('token')
      .eq('user_id', context.userId);
    if (error) throw new Error(error.message);

    let sent = 0;
    for (const device of devices ?? []) {
      const response = await fetch('https://connector-gateway.lovable.dev/firebase_messaging/v1/projects/_/messages:send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          'X-Connection-Api-Key': connectionKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: device.token,
            notification: { title: data.title, body: data.body },
            data: { path: '/app' },
          },
        }),
      });
      if (response.ok) {
        sent += 1;
        continue;
      }
      const errorBody = await response.text();
      console.error(`Push send failed [${response.status}]: ${errorBody}`);
      if (response.status === 404 || response.status === 400) {
        await context.supabase.from('device_tokens').delete().eq('token', device.token);
      }
    }
    return { sent };
  });
