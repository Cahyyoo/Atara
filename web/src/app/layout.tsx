import type { Metadata } from "next";
import { APP_NAME } from "@/core/lib/app/brand";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { getTheme } from "@/core/lib/ui/theme-server";
import { ThemeProvider } from "@/core/components/layout/theme-provider";
import { Toaster } from "@/core/components/ui/toast";
import { isLocale, DEFAULT_LOCALE } from "@/core/i18n/config";
import { coreMessages } from "@/core/i18n/catalogue";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${APP_NAME} - Super App`,
  description: "Mining operations super app: lab sample monitoring and exploration drilling data",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [locale, theme] = await Promise.all([getLocale(), getTheme()]);

  return (
    // The class is on the server-rendered HTML, so the first paint is already
    // in the right theme. Nothing flips after hydration because nothing waits
    // for hydration to know which theme this is.
    <html
      lang={locale}
      className={`${theme} ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* The shared words only. The app's layouts add the modules each
            person works in (catalogue.ts), so no page carries all of them. */}
        <NextIntlClientProvider messages={coreMessages(isLocale(locale) ? locale : DEFAULT_LOCALE)}>
          <ThemeProvider theme={theme}>
            {children}
            {/* At the root, not inside the app shell: login lives outside it,
                and a toaster that does not remount is what lets a notice
                survive the redirect that follows it. */}
            <Toaster />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
