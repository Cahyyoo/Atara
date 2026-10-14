import 'package:flutter/cupertino.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../theme/app_theme.dart';

/// The release, in small print at the foot of Settings.
///
/// There so a report from the floor ("it does this on my phone") can be tied
/// to a build without the preparator having to find it in the launcher.
///
/// Read from the installed package rather than from a constant in the code:
/// that is the number the phone itself was given, so the two cannot drift.
/// If the platform will not say, nothing is printed -- a wrong version is
/// worse than none.
class VersionFooter extends StatefulWidget {
  const VersionFooter({super.key});

  @override
  State<VersionFooter> createState() => _VersionFooterState();
}

class _VersionFooterState extends State<VersionFooter> {
  String? _version;

  @override
  void initState() {
    super.initState();
    _read();
  }

  Future<void> _read() async {
    String? version;
    try {
      version = (await PackageInfo.fromPlatform()).version;
    } catch (_) {
      // A platform that will not answer leaves the line empty.
      version = null;
    }
    if (!mounted) return;
    setState(() => _version = version);
  }

  @override
  Widget build(BuildContext context) {
    final version = _version;
    if (version == null) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(
        top: AppSpacing.lg,
        bottom: AppSpacing.sm,
      ),
      child: Text(
        'v$version',
        textAlign: TextAlign.center,
        style: AppText.footnote.copyWith(color: context.palette.tertiaryLabel),
      ),
    );
  }
}
