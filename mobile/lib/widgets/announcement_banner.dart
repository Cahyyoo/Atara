import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_localizations.dart';
import '../models/announcement.dart';
import '../providers/announcements_provider.dart';
import '../theme/app_theme.dart';

/// What an administrator put above every screen, on the phone too.
///
/// Until this existed a notice written for Operators reached only the people
/// at a desk — "XRF down tomorrow" never got to the ones holding the samples.
///
/// A warning keeps its place until it ends; an INFO notice carries a close
/// button and stays closed on this phone, which is the rule the website uses.
class AnnouncementBanner extends ConsumerWidget {
  const AnnouncementBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final announcements = ref.watch(announcementsProvider);
    if (announcements.isEmpty) return const SizedBox.shrink();

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final announcement in announcements)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: _Notice(announcement: announcement),
          ),
      ],
    );
  }
}

class _Notice extends ConsumerWidget {
  const _Notice({required this.announcement});

  final Announcement announcement;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final palette = context.palette;
    final warning = announcement.tone == AnnouncementTone.warning;
    final tone = warning ? palette.warning : palette.info;

    return Semantics(
      liveRegion: true,
      container: true,
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: tone.background,
          borderRadius: BorderRadius.circular(AppRadius.md),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              warning
                  ? CupertinoIcons.exclamationmark_triangle_fill
                  : CupertinoIcons.info_circle_fill,
              size: 20,
              color: tone.onBackground,
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                announcement.message,
                style: AppText.footnote.copyWith(color: tone.onBackground),
              ),
            ),
            if (announcement.canDismiss) ...[
              const SizedBox(width: AppSpacing.xs),
              // A 44pt target: this sits under a gloved thumb like everything
              // else on this screen.
              CupertinoButton(
                padding: EdgeInsets.zero,
                minimumSize: const Size(44, 44),
                onPressed: () => ref
                    .read(announcementsProvider.notifier)
                    .dismiss(announcement.id),
                child: Semantics(
                  label: l10n.announcementDismiss,
                  button: true,
                  child: Icon(
                    CupertinoIcons.xmark,
                    size: 16,
                    color: tone.onBackground,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
