/*
 * Licensed Materials - Property of IBM
 * 5725-G92 (C) Copyright IBM Corp. 2006, 2012. All Rights Reserved.
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
 */

//
//  WLDeviceAuthManager.h
//  WorklightStaticLibProject
//

#import <Foundation/Foundation.h>
#import <CommonCrypto/CommonDigest.h>
#import <Cordova/CDVPlugin.h>
#import "WLProvisioningDelegateImpl.h"


@interface WLDeviceAuthManager : NSObject

/**
 * Get the DeviceAuthManager singleton instance 
 */
+ (WLDeviceAuthManager *) sharedInstance;

/**
 * Generate KeyPair (private + public) and save it to Key Chain on the device.
 * Using RSA 512 long key size
 * This method should be used by custom provisioning implementation for CSR creation.  
 * It is recomended not to keep keypair in memory so this method should be called just before gneneration of CSR.  
 * return - NSMutableDictionary were element with key "private" is private key and element with key "public" is public key.
 */
-(NSMutableDictionary *) generateKeyPair;

/**
 * return the realm name from the 401 challenge
 */
-(NSString *) getRealmName;

/**
 * This method signs on a given content according to JSW standard.
 * We'll using the public key
 * Sign the header and payload with SHA256 / RSA 512 
 * csrPayload- NSMutableDictionary with the content sign on.
 * return - the signed string.
 */
-(NSString *) createCsrHeader:(NSMutableDictionary *)csrPayload;

/**
 * Entry point for WLProvisioningDelegate to save the recieved certificate to the keystore.
 * When finished saving, it will start the device authentication process.
 * keyPair
 * certificate - NSData represent the certificate
 */
-(void) saveCertificate:(NSData *)certificateData;

/**
 * Called when failed to create a certificate, will show an error message to the client, and close the application
 * If the user implemented its own provider, then he MUST call this function when getting a failure to get a certificate.
 */
-(void)csrCertificateRecieveFailed;


//Call this initializer only
-(WLDeviceAuthManager *) init:(NSString *)granularity isProvisioning:(BOOL)isProvisioning 
isProvisioningAllowed:(BOOL)isProvisioningAllowed pluginForJSExec:(CDVPlugin *) plugin provisioningRealm:(NSString *) realm;
-(NSMutableDictionary *) addDeviceIdAndAppId:(NSMutableDictionary *) payloadJSON;
-(BOOL) isCertificateExist;
-(NSData *)getKeyChainKeyBits:(NSData *) keychainTag isCertificate:(BOOL) isCertificate;
-(NSString *) getWLUniqueDeviceId;
-(NSData *) signData:(NSString *)paylaod privateKey:(SecKeyRef)privateKey;
-(void) setProvisioningDelegate:(id <WLProvisioningDelegate>) pDelegate;
-(id <WLProvisioningDelegate>) getProvisioningDelegate;
-(void)createCsr:(NSMutableDictionary *) csrPayload;
-(NSData *) getKeyIdentifier :(BOOL) isPublic;
@end

