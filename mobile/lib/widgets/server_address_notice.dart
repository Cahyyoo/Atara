import 'package:flutter/cupertino.dart';

import '../l10n/app_localizations.dart';
import '../theme/app_theme.dart';

/// Names the address a failed request used, and offers a way to change it.
///
/// The sign-in screen and the update screen each grew their own copy of this,
/// differing only in the shade of red. It belongs in one place: a wrong address
/// reads as "the network is down" on every screen, so the operator has nothing
/// to act on unless the address itself is put in front of them.
class ServerAddressNotice extends StatelessWidget {
  const ServerAddressNotice({
    super.key,
    required this.color,
    required this.onOpenSettings,
    this.address,
  });

  final Color color;

  /// How to reach the settings from here. Signed in, that is a tab; signed out,
  /// a pushed page — so the caller decides rather than this widget guessing.
  final VoidCallback onOpenSettings;

  /// Omitted where the screen could not resolve it — the settings read is
  /// sometimes the very thing that failed.
  final String? address;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (address != null) ...[
          Text(
            l10n.triedServerAddress(address!),
            style: AppText.footnote.copyWith(
              color: color,
              fontFamily: AppText.monoFamily,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
        ],
        CupertinoButton(
          padding: EdgeInsets.zero,
          minimumSize: const Size(0, 32),
          onPressed: onOpenSettings,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(CupertinoIcons.gear_alt, size: 16, color: color),
              const SizedBox(width: AppSpacing.xs),
              Text(
                l10n.checkServerAddress,
                style: AppText.subhead.copyWith(
                  color: color,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
