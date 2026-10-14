import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/user_model.dart';
import 'work_summary_cache_service.dart';

class SessionService {
  static const _tokenKey = 'atara_token';
  static const _userKey = 'atara_user';

  static Future<void> saveSession(String token, UserModel user) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, token);
    await prefs.setString(_userKey, jsonEncode(user.toJson()));
  }

  static Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_tokenKey);
  }

  /// A stored user that no longer parses is treated as no user at all, which
  /// sends the preparator to the sign-in screen instead of crashing on launch.
  static Future<UserModel?> getUser() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_userKey);
    if (raw == null) return null;

    try {
      return UserModel.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      await clearSession();
      return null;
    }
  }

  /// Raises or clears the duty to replace an administrator's password.
  ///
  /// Written on the stored user rather than on a key of its own, so the one
  /// thing the app reads on launch answers "who is signed in" and "may they
  /// work yet" together -- two keys could disagree.
  static Future<void> setMustChangePassword(bool value) async {
    final user = await getUser();
    if (user == null || user.mustChangePassword == value) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _userKey,
      jsonEncode(user.copyWith(mustChangePassword: value).toJson()),
    );
  }

  static Future<void> clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    await prefs.remove(_userKey);
    // One preparator's shift tally must not still be on screen for the next.
    await WorkSummaryCacheService.clear();
  }
}
