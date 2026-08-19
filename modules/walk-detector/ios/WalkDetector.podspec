Pod::Spec.new do |s|
  s.name           = 'WalkDetector'
  s.version        = '1.0.0'
  s.summary        = 'Background walk detection (stub).'
  s.description    = 'JS <-> Swift surface for walk detection. Detection logic lands in a later session.'
  s.author         = ''
  s.homepage = 'https://github.com/likelion-mowa/mowa-frontend'
  # 16.4 is the Expo SDK 56+ minimum deployment target.
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
