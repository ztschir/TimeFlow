
/* JavaScript content from wlclient/js/deviceAuthentication.js in Common Resources */
/*
* Licensed Materials - Property of IBM
* 5725-G92 (C) Copyright IBM Corp. 2006, 2012. All Rights Reserved.
* US Government Users Restricted Rights - Use, duplication or
* disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
*/

/**
 * Object which handle the device authentication 
 */
__WLDeviceAuth = function() {
	this.__requestToResend = null,
	this.__deviceChallengeToken = null,
	
	/**
	 * Get payload from custom/default 
	 */
	this.startDeviceAuth = function (customPayloadJSON) { 
		//The native code will add to the extenedPayloadJSON the app and the device
		var extenedPayloadJSON = {
				token : this.__deviceChallengeToken,
				custom : customPayloadJSON
		}
		createDeviceAuthHeader(extenedPayloadJSON,
			// on success		
			function(jwsHeader) {
				WL.DeviceAuth.__requestToResend.options.requestHeaders.Authorization = WL.Utils.getCordovaPluginResponseObject(jwsHeader, "jwsHeader");
				WL.DeviceAuth.__requestToResend.sendRequest();			
			}, 
			// on failure
			function () {
				//Error handling - Cannot create jws header
				WL.Logger.error("Device authentication: problem creating jws header", "");
				WL.DiagnosticDialog.showDialog(WL.ClientMessages.wlclientInitFailure, 
						WL.ClientMessages.deviceAuthenticationFail, false, true, transport);
			}
		);
	},
	
	this.__sendDeviceAuthentication = function(){
		WL.Client.__getCustomDeviceProperties(function(data) {
			WL.DeviceAuth.startDeviceAuth(data);
		});
	},

	this.on401 = function (transport, origRequest) {
		var deviceProvisioningSettings = {
				enabled: false,
				allowed: false,
				entity: "",
				realm: ""
		}
		
		if (WL.EnvProfile.isEnabled(WL.EPField.SUPPORT_DEVICE_AUTH)) {
			var authHeader = transport.getHeader("WWW-Authenticate");
			
			if (authHeader == "WL-Composite-Authentication") {
				WL.DeviceAuth.__deviceChallengeToken = transport.responseJSON.deviceAuthentication.token;
				
				// Extract deviceProvisioningEnabled, isProvisioningAllowed from header
				// If no provisioning then deviceProvisioningEnabled = false (default)
				if (transport.responseJSON.deviceProvisioning) {
					deviceProvisioningSettings.enabled = true;
					deviceProvisioningSettings.allowed = (transport.responseJSON.deviceProvisioning.allowed == "true");
					deviceProvisioningSettings.entity = transport.responseJSON.deviceProvisioning.entity;
					deviceProvisioningSettings.realm = transport.responseJSON.deviceProvisioning.realm;
				}
				
				WL.DeviceAuth.__requestToResend = origRequest;
				WL.DeviceAuth.__init(
						deviceProvisioningSettings,
						// success callback
						function() {
							deviceAuthInitSuccess();
						},
						// failure callback
						function() {
							//Error handling - the auth header value is incorrect - we cannot handle it
							WL.Logger.error("Problem initiailizeing AuthManager", "");
							WL.DiagnosticDialog.showDialog(WL.ClientMessages.wlclientInitFailure, 
									WL.ClientMessages.deviceAuthenticationFail, false, false);
						}
				);
			} else {
				//Error handling - the auth header value is incorrect - we cannot handle it
				WL.Logger.error("Auth Header incorrect - received " + authHeader, "");
				WL.DiagnosticDialog.showDialog(WL.ClientMessages.wlclientInitFailure, 
						WL.ClientMessages.deviceAuthenticationFail, false, true, transport);
			}
		} else {
			//Error handling - Authentication not supported on platform
			WL.Logger.error("Cannot start device authentication, not supported on platform", "");
			WL.DiagnosticDialog.showDialog(WL.ClientMessages.wlclientInitFailure, 
					WL.ClientMessages.deviceAuthenticationFail, false, true, transport);
		}
		
		function deviceAuthInitSuccess() {
			//when there is no provisioning, just start auth, do not check if there is a certificate
			if (!deviceProvisioningSettings.enabled) {
				WL.DeviceAuth.__sendDeviceAuthentication();
			} else {
				isCertificateExists (
						// success callback
						function(result) {
							var isCertificateExists = WL.Utils.getCordovaPluginResponseObject(result, "isCertificateExists");
							isCertificateExists = ("true" == isCertificateExists);
							
							if (isCertificateExists) {
								// Get a reference to the correct onDeviceAuthPayload and invoke the success param using 
								// extra data if present
								WL.DeviceAuth.__sendDeviceAuthentication();
							} else if (!isCertificateExists && deviceProvisioningSettings.allowed) {
								//start provisioning
								WL.Client.__getCustomDeviceProvisioningProperties(function(data) {
									//we do not handle success, since native code will take care of that, and run the approriate js code for success
									createCSR({data:data},
											// failure callback
											function() {
												//Error handling - Cannot start csr process, user did not state an implementation.
												WL.DiagnosticDialog.showDialog(WL.ClientMessages.wlclientInitFailure, 
														WL.ClientMessages.deviceAuthenticationFail, false, true, transport);
											});
								});
							}
						},
						// failure callback
						function() {
							//Error handling - failed getting shouldStartDeviceAuth - logging is done in java code
							WL.DiagnosticDialog.showDialog(WL.ClientMessages.wlclientInitFailure, 
									WL.ClientMessages.deviceAuthenticationFail, false, true, transport);
						});
			}
		}
	},
	
	/**
     * Default implementation for WL.Client.init's options onGetCustomDeviceProperties.
     * Our default implementation actually does nothing.
     * If overriding this method, the user must call resumeDeviceAuthProcess with the payload
     * 
     * @param resumeDeviceAuthProcess function to call when done with getting extra data
     */
    this.__defaultOnGetCustomDeviceProperties = function(resumeDeviceAuthProcess) {    	
		resumeDeviceAuthProcess({});
    },
    
    /**
     * Default implementation for WL.Client.init's options onGetCustomDeviceProvisioningProperties.
     * Our default implementation actually does nothing.
     * If overriding this method, the user must call resumeDeviceProvisioningProcess with the payload
     * 
     * @param resumeDeviceProvisioningProcess function to call when ready
     */
    this.__defaultOnGetCustomDeviceProvisioningProperties = function(resumeDeviceProvisioningProcess) {    	
    	resumeDeviceProvisioningProcess({});
    },
	
	/**
	 * Check if the device has a certificate
	 * @param successCallback
	 * @param failureCallback
	 */
    isCertificateExists = function(successCallback, failureCallback) {
	    cordova.exec(successCallback, failureCallback, "DeviceAuth", "isCertificateExists", []);
	},

	/**
	 * Create the device auth header
	 * @param payloadJSON - application JSON data
	 * @param successCallback
	 * @param failureCallback
	 */
	createDeviceAuthHeader = function(payloadJSON, successCallback, failureCallback) {
		cordova.exec(successCallback, failureCallback, "DeviceAuth", "createDeviceAuthHeader", [payloadJSON]);
	},

	/**
	 * Create the device csr header
	 * We do not handle success because native code will run the appropriate JS method when success happens
	 * @param payloadJSON - application JSON data
	 * @param failureCallback
	 */
	createCSR = function(csrData, failureCallback) {
		cordova.exec(null, failureCallback, "DeviceAuth", "createCSR", [csrData]);
	};
};
__WL.prototype.DeviceAuth = new __WLDeviceAuth;
WL.DeviceAuth = new __WLDeviceAuth;
