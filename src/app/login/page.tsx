import { Button, field, fieldLabel, FinePrint, Panel } from "@/components/ui";
import { signIn, signUp } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const { error, message, next } = await searchParams;

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4">
      <Panel className="p-6 sm:p-8">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Get growing</h1>
        <p className="mt-2 text-ink-soft">New here? Create an account and get 20 free credits for the beta.</p>

        {error && <p className="mt-4 rounded-lg border-2 border-tomato bg-tomato/10 p-3 text-sm">{error}</p>}
        {message && <p className="mt-4 rounded-lg border-2 border-leaf bg-leaf/10 p-3 text-sm">{message}</p>}

        <form className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="next" value={next ?? ""} />
          <div>
            <label htmlFor="email" className={fieldLabel}>Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" className={field} />
          </div>
          <div>
            <label htmlFor="password" className={fieldLabel}>Password</label>
            <input id="password" name="password" type="password" required minLength={8} autoComplete="current-password" className={field} />
          </div>
          <Button formAction={signIn}>Sign in</Button>
          <Button formAction={signUp} variant="ghost">Create account</Button>
        </form>
        <FinePrint className="mt-6">At least 8 characters for the password.</FinePrint>
      </Panel>
    </main>
  );
}
