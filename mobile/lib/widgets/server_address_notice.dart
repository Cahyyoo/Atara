import 'package:flutter/cupertino.dart';

import '../l10n/app_localizations.dart';
import '../theme/app_theme.dart';

/// Names the address a failed request used, and who can fix it.
///
/// The sign-in screen and the update screen each grew their own copy of this,
/// differing only in the shade of red. The address itself is set by the lab
/// admin on the website now, so there is nothing to change on the phone; the
/// address is still shown, because it is what the admin needs to hear.
class ServerAddressNotice extends StatelessWidget {
  const ServerAddressNotice({
    super.key,
    required this.color,
    this.address,
  });

  final Color color;

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
        Text(
          l10n.serverUnreachableAskAdmin,
          style: AppText.footnote.copyWith(color: color),
        ),
      ],
    );
  }
}
