# Flutter and its plugins are reached through JNI and platform channels, which
# the shrinker cannot see. The engine's own rules cover io.flutter; these cover
# what mobile_scanner pulls in.

# ML Kit loads its barcode models by reflection on class names.
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit_** { *; }

# Optional ML Kit text-recognition entry points that barcode scanning does not
# use. Without this the shrinker warns about references it cannot resolve.
-dontwarn com.google.mlkit.vision.text.**
