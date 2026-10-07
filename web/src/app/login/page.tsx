import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { LoginForm } from "@/components/login-form";
import { LoginLocaleSwitch } from "@/components/login-locale-switch";
import { APP_NAME } from "@/lib/brand";
import { IoPrismOutline } from "react-icons/io5";

export default async function LoginPage() {
  const t = await getTranslations("auth");

  return (
    /*
      A box the height of the screen, not a column that grows past it.

      It was min-h-screen with generous padding, which is right for a page that
      scrolls and wrong for this one: the face step carries a camera and two
      buttons, and the last of them ended up below the fold. dvh rather than vh
      because a phone's address bar moves and takes the viewport with it --
      the same reason dialog.tsx uses it.

      Nothing here is sized in pixels. The camera carries its own cap and
      shrinks first, so a short window loses picture rather than losing the
      controls underneath it. On a very short window the spacing around the
      card tightens too, so the authenticator setup still fits without the
      card having to scroll.
    */
    <div className="flex h-dvh flex-col items-center justify-center gap-4 overflow-hidden bg-muted/40 px-4 py-4 [@media(max-height:620px)]:gap-2 [@media(max-height:620px)]:py-2">
      {/* The brand sits above the card rather than inside it. CardHeader is a
          grid, so an icon dropped into it lines up left while the text centres —
          which is exactly how this page used to look.

          On one row rather than stacked: the mark beside the name costs about
          half the height of the mark above it, and that is height the
          authenticator setup below needs more than this does. */}
      <header className="flex shrink-0 items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
          <IoPrismOutline className="size-5" />
        </div>
        <div>
          <h1 className="font-heading text-lg font-semibold leading-tight tracking-tight">
            {APP_NAME}
          </h1>
          <p className="text-xs text-muted-foreground">{t("title")}</p>
        </div>
      </header>

      <Card className="flex w-full min-h-0 max-w-sm flex-col [--card-spacing:--spacing(5)]">
        {/*
          The scrolling child, as a last resort rather than a habit.

          The camera above shrinks first, so on any ordinary window this never
          scrolls. It is here because content clipped off the bottom of a card
          is worse than content somebody can reach.
        */}
        <CardContent className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          {/* The opening line belongs to the form, not to the page. It used to
              live here and stayed put when the form moved to the face step, so
              "Sign in to access the monitoring dashboard" sat above a camera
              belonging to somebody whose password had already been accepted. */}
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>

      {/* The only place the language can be changed before signing in: the
          switcher in the account menu is behind the login itself. */}
      <LoginLocaleSwitch />
    </div>
  );
}
