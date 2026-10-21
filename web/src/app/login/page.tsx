import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/core/components/ui/card";
import { AuthBrandPanel } from "@/core/components/auth/auth-brand-panel";
import { LoginForm } from "@/core/components/auth/login-form";
import { LoginLocaleSwitch } from "@/core/components/auth/login-locale-switch";
import { APP_NAME } from "@/core/lib/app/brand";
import { IoAppsOutline, IoServerOutline, IoShieldCheckmarkOutline } from "react-icons/io5";
import { BrandMark } from "@/core/components/layout/brand-mark";

export default async function LoginPage() {
  const [t, tNav] = await Promise.all([getTranslations("auth"), getTranslations("nav")]);
  // What the platform offers, not which modules it has: true as modules are added.
  const points = [
    { key: "access", icon: IoShieldCheckmarkOutline },
    { key: "data", icon: IoServerOutline },
    { key: "account", icon: IoAppsOutline },
  ].map(({ key, icon }) => ({ key, icon, title: t(`points.${key}.title`), body: t(`points.${key}.body`) }));

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

      Split from lg up: the brand and what the platform offers on the left,
      the form on the right. Below lg the panel goes and the form keeps the
      whole screen.
    */
    <div className="grid h-dvh overflow-hidden lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <AuthBrandPanel
        brandSubtitle={tNav("brandSubtitle")}
        title={t("panelTitle")}
        subtitle={t("panelSubtitle")}
        points={points}
        footer={`© ${new Date().getFullYear()} ${APP_NAME} · ${tNav("brandSubtitle")}`}
      />

      <main className="flex min-h-0 flex-col items-center justify-center gap-4 overflow-hidden bg-muted/40 px-4 py-4 lg:bg-background lg:px-10 [@media(max-height:620px)]:gap-2 [@media(max-height:620px)]:py-2">
        {/* The brand sits above the card rather than inside it. CardHeader is
            a grid, so an icon dropped into it lines up left while the text
            centres -- which is exactly how this page used to look.

            On one row rather than stacked: the mark beside the name costs
            about half the height of the mark above it, and that is height the
            authenticator setup below needs more than this does. From lg up
            the panel carries the brand, so this becomes the greeting. */}
        <header className="flex shrink-0 items-center gap-3 lg:hidden">
          <div className="surface-hero flex size-10 shrink-0 items-center justify-center rounded-2xl text-white">
            <BrandMark className="size-6" />
          </div>
          <div>
            <h1 className="font-heading text-lg font-semibold leading-tight tracking-tight">{APP_NAME}</h1>
            <p className="text-xs text-muted-foreground">{t("title")}</p>
          </div>
        </header>
        <h1 className="hidden w-full max-w-sm shrink-0 text-center font-heading text-2xl font-semibold tracking-tight lg:block">
          {t("welcomeTitle")}
        </h1>

        {/* A card on small screens, to lift the form off the grey; on the
            plain right half from lg up it needs no chrome of its own. */}
        <Card className="flex w-full min-h-0 max-w-sm flex-col [--card-spacing:--spacing(5)] lg:overflow-visible lg:bg-transparent lg:shadow-none lg:[--card-spacing:--spacing(0)]">
          {/*
            The scrolling child, as a last resort rather than a habit.

            The camera above shrinks first, so on any ordinary window this
            never scrolls. It is here because content clipped off the bottom
            of a card is worse than content somebody can reach.

            A scrolling box clips on every side, and a focus ring is drawn
            3px outside its field: 4px of padding gives the ring room, and
            the same 4px taken back as margin leaves every field where it
            was. Sideways only from lg up, where the chromeless card has no
            padding of its own (and so need not clip either).
          */}
          <CardContent className="-my-1 flex min-h-0 flex-col gap-4 overflow-y-auto py-1 lg:-mx-1 lg:px-1">
            {/* The opening line belongs to the form, not to the page. It used
                to live here and stayed put when the form moved to the face
                step, so "Sign in to access the monitoring dashboard" sat above
                a camera belonging to somebody whose password had already been
                accepted. */}
            <Suspense fallback={null}>
              <LoginForm />
            </Suspense>
          </CardContent>
        </Card>

        {/* The only place the language can be changed before signing in: the
            switcher in the account menu is behind the login itself. */}
        <LoginLocaleSwitch />
      </main>
    </div>
  );
}
