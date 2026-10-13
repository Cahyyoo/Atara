"use client";

import { useCallback, useState } from "react";
import { FaceStep } from "@/core/components/face/face-step";
import { MethodChooser } from "@/core/components/mfa/method-chooser";
import { TotpStep } from "@/core/components/mfa/totp-step";
import { TotpSetupStep } from "@/core/components/mfa/totp-setup-step";
import type { SecondFactorMethod } from "@/core/lib/auth/second-factor";

/**
 * Everything between an accepted password and a session.
 *
 * One challenge serves every method, so switching from the camera to the
 * phone does not mean typing the password again. The setup step hands back a
 * fresh one; it is kept here so whichever method comes next uses it.
 */
export function SecondFactorStep({
  challenge: initialChallenge,
  name,
  methods: initialMethods,
  onVerified,
  onCancel,
}: {
  challenge: string;
  name: string;
  methods: SecondFactorMethod[];
  onVerified: () => void;
  onCancel: () => void;
}) {
  const [challenge, setChallenge] = useState(initialChallenge);
  // State rather than a prop read: a matched face can hand over to the
  // authenticator setup, and that arrives as a new list of methods.
  const [methods, setMethods] = useState(initialMethods);
  // Straight to the only method there is; a choice of one is not a choice.
  const [method, setMethod] = useState<SecondFactorMethod | null>(
    initialMethods.length === 1 ? initialMethods[0] : null
  );
  const onSwitchMethod = methods.length > 1 ? () => setMethod(null) : undefined;
  const handleChallenge = useCallback((next: string) => setChallenge(next), []);
  const handleContinue = useCallback(
    (next: { challenge: string; methods: SecondFactorMethod[] }) => {
      setChallenge(next.challenge);
      setMethods(next.methods);
      setMethod(next.methods.length === 1 ? next.methods[0] : null);
    },
    []
  );

  if (method === "face") {
    return (
      <FaceStep
        challenge={challenge}
        name={name}
        onVerified={onVerified}
        onContinue={handleContinue}
        onCancel={onCancel}
        onSwitchMethod={onSwitchMethod}
      />
    );
  }

  if (method === "totp") {
    return (
      <TotpStep
        challenge={challenge}
        name={name}
        onVerified={onVerified}
        onCancel={onCancel}
        onSwitchMethod={onSwitchMethod}
      />
    );
  }

  if (method === "totp-setup") {
    return (
      <TotpSetupStep
        challenge={challenge}
        name={name}
        onChallenge={handleChallenge}
        onVerified={onVerified}
        onCancel={onCancel}
        onSwitchMethod={onSwitchMethod}
      />
    );
  }

  return <MethodChooser methods={methods} name={name} onChoose={setMethod} onCancel={onCancel} />;
}
