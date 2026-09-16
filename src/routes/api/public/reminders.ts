import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';

/**
 * Hourly nudge: anyone who still has an unfinished task gets one push per run.
 * Meant to be called on a schedule (every hour) with the cron bearer secret.
 */
async function runReminders() {
  const lovableApiKey = process.env['LOVABLE_API_KEY'];
  const connectionKey = process.env['FIREBASE_MESSAGING_API_KEY'];
  if (!lovableApiKey || !connectionKey) {
    return new Response(JSON.stringify({ error: 'Reminders are not configured yet.' }), { status: 500 });
  }

  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

  const { data: pending, error: tasksError } = await supabaseAdmin
    .from('tasks')
    .select('user_id, title')
    .eq('done', false);
  if (tasksError) return new Response(JSON.stringify({ error: tasksError.message }), { status: 500 });

  const byUser = new Map<string, { count: number; title: string }>();
  for (const row of pending ?? []) {
    const current = byUser.get(row.user_id);
    if (current) current.count += 1;
    else byUser.set(row.user_id, { count: 1, title: row.title });
  }
  if (byUser.size === 0) return Response.json({ users: 0, sent: 0 });

  const { data: devices, error: deviceError } = await supabaseAdmin
    .from('device_tokens')
    .select('user_id, token')
    .in('user_id', [...byUser.keys()]);
  if (deviceError) return new Response(JSON.stringify({ error: deviceError.message }), { status: 500 });

  let sent = 0;
  for (const device of devices ?? []) {
    const info = byUser.get(device.user_id);
    if (!info) continue;
    const body = info.count === 1
      ? `Still waiting: ${info.title}`
      : `${info.count} tasks still waiting. Start with "${info.title}".`;
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
          notification: { title: 'Habitot', body },
          data: { path: '/app' },
        },
      }),
    });
    if (response.ok) {
      sent += 1;
      continue;
    }
    const errorBody = await response.text();
    console.error(`Hourly reminder failed [${response.status}]: ${errorBody}`);
    if (response.status === 404 || response.status === 400) {
      await supabaseAdmin.from('device_tokens').delete().eq('token', device.token);
    }
  }

  return Response.json({ users: byUser.size, sent });
}

export const Route = createFileRoute('/api/public/reminders')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        return runReminders();
      },
      GET: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        return runReminders();
      },
    },
  },
});
