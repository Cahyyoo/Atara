import 'package:dio/dio.dart';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';

import '../l10n/app_localizations.dart';
import '../services/update_service.dart';
import '../theme/app_theme.dart';

String _megabytes(BuildContext context, int bytes) => NumberFormat(
  '0.0',
  Localizations.localeOf(context).toString(),
).format(bytes / (1024 * 1024));

/// Asks about [update] and, on a yes, shows the download through to Android's
/// installer. "Later" simply closes it; the next cold start asks again.
Future<void> offerUpdate(
  BuildContext context,
  AppUpdate update,
  UpdateService service,
) async {
  final l10n = AppLocalizations.of(context)!;
  final accepted = await showCupertinoDialog<bool>(
    context: context,
    builder: (context) => CupertinoAlertDialog(
      title: Text(l10n.updateAvailableTitle),
      content: Text(
        [
          l10n.updateAvailableBody(
            _megabytes(context, update.size),
            update.versionName,
          ),
          if (update.notes.isNotEmpty) update.notes,
        ].join('\n\n'),
      ),
      actions: [
        CupertinoDialogAction(
          onPressed: () => Navigator.of(context).pop(false),
          child: Text(l10n.updateLater),
        ),
        CupertinoDialogAction(
          isDefaultAction: true,
          onPressed: () => Navigator.of(context).pop(true),
          child: Text(l10n.updateNow),
        ),
      ],
    ),
  );
  if (accepted != true || !context.mounted) return;
  await showCupertinoDialog<void>(
    context: context,
    builder: (context) => UpdateDownloadDialog(update: update, service: service),
  );
}

enum _Stage { downloading, failed, ready }

/// The download's progress, what went wrong, or the way to the installer.
///
/// Stays open once the file is ready: the first install sends the person to
/// Android's "allow from this source" setting, and they need a way to carry on
/// from there without downloading it again.
class UpdateDownloadDialog extends StatefulWidget {
  const UpdateDownloadDialog({
    super.key,
    required this.update,
    required this.service,
  });

  final AppUpdate update;
  final UpdateService service;

  @override
  State<UpdateDownloadDialog> createState() => _UpdateDownloadDialogState();
}

class _UpdateDownloadDialogState extends State<UpdateDownloadDialog> {
  _Stage _stage = _Stage.downloading;
  int _received = 0;
  String? _path;
  String Function(AppLocalizations)? _error;
  CancelToken? _cancel;

  @override
  void initState() {
    super.initState();
    _download();
  }

  @override
  void dispose() {
    _cancel?.cancel();
    super.dispose();
  }

  Future<void> _download() async {
    final cancel = CancelToken();
    _cancel = cancel;
    try {
      final path = await widget.service.download(
        widget.update,
        cancelToken: cancel,
        onProgress: (received) {
          if (mounted) setState(() => _received = received);
        },
      );
      if (!mounted) return;
      setState(() {
        _path = path;
        _stage = _Stage.ready;
      });
    } on UpdateCorruptedException {
      _fail((l10n) => l10n.updateCorrupted);
    } catch (_) {
      // Closing the dialog cancels the download; nothing is left to report to.
      if (!cancel.isCancelled) _fail((l10n) => l10n.updateDownloadFailed);
    }
  }

  void _fail(String Function(AppLocalizations) message) {
    if (!mounted) return;
    setState(() {
      _error = message;
      _stage = _Stage.failed;
    });
  }

  /// Back to the installer if the file is already here; otherwise download it.
  void _retry() {
    if (_path != null) {
      setState(() => _stage = _Stage.ready);
      return;
    }
    setState(() {
      _stage = _Stage.downloading;
      _received = 0;
    });
    _download();
  }

  Future<void> _install() async {
    try {
      await widget.service.install(_path!);
    } catch (_) {
      _fail((l10n) => l10n.updateInstallFailed);
    }
  }

  void _close() => Navigator.of(context).pop();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return PopScope(
      canPop: false,
      child: switch (_stage) {
        _Stage.downloading => CupertinoAlertDialog(
          title: Text(l10n.updateDownloadingTitle),
          content: _progress(context, l10n),
          actions: [
            CupertinoDialogAction(
              onPressed: _close,
              child: Text(l10n.cancel),
            ),
          ],
        ),
        _Stage.failed => CupertinoAlertDialog(
          title: Text(l10n.updateFailedTitle),
          content: Text(_error!(l10n)),
          actions: [
            CupertinoDialogAction(
              onPressed: _close,
              child: Text(l10n.updateClose),
            ),
            CupertinoDialogAction(
              isDefaultAction: true,
              onPressed: _retry,
              child: Text(l10n.retry),
            ),
          ],
        ),
        _Stage.ready => CupertinoAlertDialog(
          title: Text(l10n.updateReadyTitle),
          content: Text(l10n.updateReadyBody),
          actions: [
            CupertinoDialogAction(
              onPressed: _close,
              child: Text(l10n.updateLater),
            ),
            CupertinoDialogAction(
              isDefaultAction: true,
              onPressed: _install,
              child: Text(l10n.updateInstall),
            ),
          ],
        ),
      },
    );
  }

  Widget _progress(BuildContext context, AppLocalizations l10n) {
    final palette = context.palette;
    final total = widget.update.size;
    final fraction = total > 0 ? (_received / total).clamp(0.0, 1.0) : 0.0;
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.md),
      child: Column(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.pill),
            child: Container(
              height: 6,
              color: palette.fill,
              alignment: Alignment.centerLeft,
              child: FractionallySizedBox(
                widthFactor: fraction,
                heightFactor: 1,
                child: ColoredBox(color: palette.accent),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            l10n.updateProgress(
              _megabytes(context, _received),
              _megabytes(context, total),
            ),
            style: const TextStyle(fontFeatures: [FontFeature.tabularFigures()]),
          ),
        ],
      ),
    );
  }
}
