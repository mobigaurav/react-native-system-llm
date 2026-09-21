require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'react-native-system-llm'
  s.version      = package['version']
  s.summary      = package['description']
  s.homepage     = package['homepage']
  s.license      = package['license']
  s.authors      = package['author']

  s.platforms    = { :ios => '15.1' }
  s.source       = { :git => 'https://github.com/mobigaurav/react-native-system-llm.git', :tag => "v#{s.version}" }
  s.source_files = 'ios/*.{h,m,mm,swift}'

  # Weak-link so apps with deployment target < iOS 26 still install; runtime
  # gates handle the rest.
  s.weak_frameworks = ['FoundationModels']

  s.dependency 'React-Core'
end
