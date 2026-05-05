<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# No mock data in production paths

Jordan OS is an agent system. The CEO Agent and downstream agents read directly from the same tables and pages a human would see. **Mock data anywhere in a rendered page or queried table will be treated as real by the agents and will distort their recommendations.**

Rules:
- Never add a mock-data fallback to a page that's wired to Supabase. If the DB is empty, render an empty state — that's the honest signal.
- Never seed mock numbers into a real table. If a table needs sample data for development, gate it behind an explicit `NEXT_PUBLIC_DEV_SEED` flag and never run it against production.
- `lib/mock-data.ts` is being phased out. New features must not import from it. When you migrate the last page off it, delete the file.
- Any UI element backed by `mockX` must either be wired to a real query or removed. No "we'll fix it later" placeholders left in the dashboard.
