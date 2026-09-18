import { signIn, signInWithGoogle, signUp } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const { error, message, next } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Sign in</h1>

      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p className="rounded bg-green-50 p-3 text-sm text-green-700">{message}</p>}

      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next ?? ""} />
        <button className="w-full rounded border px-4 py-2 font-medium">Continue with Google</button>
      </form>

      <form className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next ?? ""} />
        <input name="email" type="email" required placeholder="Email" className="rounded border px-3 py-2" />
        <input
          name="password"
          type="password"
          required
          minLength={8}
          placeholder="Password"
          className="rounded border px-3 py-2"
        />
        <button formAction={signIn} className="rounded bg-black px-4 py-2 font-medium text-white">
          Sign in
        </button>
        <button formAction={signUp} className="rounded border px-4 py-2 font-medium">
          Create account
        </button>
      </form>
    </main>
  );
}
