//
// SystemLLMFoundationModels.m
//
// Objective-C bridge stub — registers SystemLLMFoundationModels with React
// Native.
//

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(SystemLLMFoundationModels, NSObject)

RCT_EXTERN_METHOD(isAvailable:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(createSession:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(generate:(NSDictionary *)payload
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(releaseSession:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
