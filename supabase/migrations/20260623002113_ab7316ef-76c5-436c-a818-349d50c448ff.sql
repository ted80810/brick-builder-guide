UPDATE public.manuals
SET status = 'failed',
    content = COALESCE(content, '{}'::jsonb) || jsonb_build_object('error', 'Generation timed out or was interrupted. Please try again.')
WHERE status IN ('generating', 'pending')
  AND created_at < now() - interval '5 minutes';