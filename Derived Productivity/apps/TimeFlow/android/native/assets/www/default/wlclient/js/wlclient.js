
/* JavaScript content from wlclient/js/wlclient.js in Common Resources */
/*
* Licensed Materials - Property of IBM
* 5725-G92 (C) Copyright IBM Corp. 2006, 2012. All Rights Reserved.
* US Government Users Restricted Rights - Use, duplication or
* disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
*/

/* Copyright (C) Worklight Ltd. 2006-2012.  All rights reserved. */

/**
 * WLClient uses Douglas Crockford's Module (Singleton) Pattern.
 * 
 * @requires prototype.js
 * @requires gadgetCommunicationAPI.js
 * @requires wlcommon.js
 * @requires messages.js
 * @requires worklight.js
 */

__WLClient = function() {

    // .................. Private Constants ..................

    // GadgetAPIServlet paths.
    // Must always be in synch with the corresponding GadgetRequestInfo.GADGETS_HANDLER_... Java constants.
	var REQ_PATH_INIT = "init";
	var REQ_PATH_LOGIN = "login";
	var REQ_PATH_LOGOUT = "logout";
	var REQ_PATH_GET_USER_INFO = "getuserinfo";
	var REQ_PATH_SET_USER_PREFS = "setup";
	var REQ_PATH_DELETE_USER_PREF = "deleteup";
	var REQ_PATH_PROXY = "proxy";
	var REQ_PATH_BACKEND_QUERY = "query";
	var REQ_PATH_HEART_BEAT = "heartbeat";
	var REQ_PATH_LOG_ACTIVITY = "logactivity";
	var REQ_PATH_GET_APP_UPDATES = "updates";
	var REQ_PATH_COMPOSITE = "composite";
	var REQ_PATH_APP_VERSION_ACCESS = "appversionaccess";

	var REQ_PARAM_JSESSION_ID = "jsessionid";
	var REQ_PARAM_LOGIN_REALM = "realm";

    // The local storage key for keeping the last notification received, in order to show only new
    // notifications on foreground
	var LAST_NOTIFICATION_KEY = "lastNotification";

	var LOGIN_POPUP_CHECK_INTERVAL_IN_SEC = 1;
	var LOGIN_AUTH_CHECK_POLLING_INTERVAL_IN_SEC = 5;
	var LOGIN_AUTH_CHECK_POLLING_DURATION_IN_SEC = 60;

    // The div id under which application content should reside.
	var DIV_ID_CONTENT = 'content';
    // Vista only
	var DIV_ID_UNDOCK_CONTENT = 'undockContent';

	var MESSAGE_TYPE_BLOCK = "BLOCK";
	var MESSAGE_TYPE_NOTIFY = "NOTIFY";

    // .................. Private Members ..........................

	var userInfo = {};
	var gadgetProps = {};
	var userPrefs = {};

	var blockingDiv = null;

	var busyIndicator = null;

	var initOptions = {
		onSuccess : function() {
		},
		onFailure : onDefaultInitFailure,
		onConnectionFailure : onRequestTimeout,
		timeout : 0,
		showLogger : null,
		minAppWidth : 170,
		heartBeatIntervalInSecs : 20 * 60,
		onUnsupportedVersion : onUnsupportedVersion,
		onUnsupportedBrowser : onUnsupportedBrowser,
		onDisabledCookies : onDisabledCookies,
		onUserInstanceAccessViolation : onUserInstanceAccessViolation,
		onGetCustomDeviceProperties: WL.DeviceAuth.__defaultOnGetCustomDeviceProperties,
		onGetCustomDeviceProvisioningProperties: WL.DeviceAuth.__defaultOnGetCustomDeviceProvisioningProperties,
		validateArguments : true,
		updateSilently : false
    // authenticator : ...
    // messages : ...
    // busyOptions : ...
	};

	var contentPort = null;
	var authPort = null;
	var isDefaultDockActivated = false;
	var isLoginActive = false;
	var isConnecting = false;
	var _isConnected = null;

    // for backward compatibility (version < 4.2): since 4.2 content element moved from dedicated div to body
	var isContentOnBody = null;

    // to differentiate applications that support skins to those who don't
	var isAppHasSkinLoaderChecksum = null;

	var vistaBodyStyleInContent = null;
	var vistaBodyStyleInAuth = null;
	var vistaBodyStyleInDock = null;

	var loginCheckPeriodicalExecuter = null;
	var loginCheckStartTime = null;
	var heartBeatPeriodicalExecuter = null;

    // Used by Air only.
	var isMinimized = false;

    // Used for extending async-methods options object to add default implementations.
	var defaultOptions = {
		onSuccess : function(response) {
			WL.Logger.debug("defaultOptions:onSuccess");
		},
		onFailure : function(response) {
			WL.Logger.error("defaultOptions:onFailure " + response.errorMsg);
		},
		invocationContext : null
	};

	var errorCodeCallbacks = {};
	errorCodeCallbacks[WL.ErrorCode.UNSUPPORTED_BROWSER] = 'onUnsupportedBrowser';
	errorCodeCallbacks[WL.ErrorCode.REQUEST_TIMEOUT] = 'onConnectionFailure';
	errorCodeCallbacks[WL.ErrorCode.UNRESPONSIVE_HOST] = 'onConnectionFailure';
	errorCodeCallbacks[WL.ErrorCode.UNSUPPORTED_VERSION] = 'onUnsupportedVersion';
	errorCodeCallbacks[WL.ErrorCode.DISABLED_COOKIES] = 'onDisabledCookies';
	errorCodeCallbacks[WL.ErrorCode.USER_INSTANCE_ACCESS_VIOLATION] = 'onUserInstanceAccessViolation';

    // .................. Private Methods ..........................
    //     

    // Default implementation for the WL.Client.init onFailure (Application may override).
    // If a specific failure handler exist - it is called, otherwise a default error dialog
    // is displayed (with reload app link).
    // Application may choose to override specific exceptions or to override the general
    // onFailure, in this case it has to handle all exceptions.
	function onDefaultInitFailure(response) {
		WL.Logger.error("Client init failed. " + response.errorMsg);
		var errMsg = (response.errorMsg == WL.ClientMessages.authFailure ? response.errorMsg : WL.ClientMessages.unexpectedError);
		showWidgetContent();
		var callbackName = errorCodeCallbacks[response.errorCode];
		if (callbackName && initOptions[callbackName]) {
			initOptions[callbackName](response);
		} else {
			showDialog(WL.ClientMessages.wlclientInitFailure, response.userMsg ? response.userMsg : errMsg, response.recoverable, true, response);
		}
	}

	function onUnsupportedVersion(response) {
	// On Air the content should appear before dialog, see bug
	// http://bugzilla.worklight.com/show_bug.cgi?id=2956
		if (getEnv() === WL.Env.ADOBE_AIR) {
			showWidgetContent();
		}
	// Patch - downloadNewVersion element is added in the msg string.
		WL.SimpleDialog.show(WL.ClientMessages.gadgetUpdateAvailable, response.errorMsg, [{
			text : WL.ClientMessages.ok,
			handler : function() {
				// Note you must add the null options to openURL otherwise the event is assumed the 3rd argument.
				WL.App.openURL(getAppProp(WL.AppProp.DOWNLOAD_APP_LINK), "_new", null);
				if (getEnv() === WL.Env.ADOBE_AIR) {
					window.setTimeout(WL.Client.close, 100);
				}
			}
		}]);
	}

	function onRequestTimeout(response) {
		showDialog(WL.ClientMessages.wlclientInitFailure, WL.ClientMessages.requestTimeout, true, true, response);
	}

	function onUnsupportedBrowser(response) {
		WL.SimpleDialog.show(WL.ClientMessages.wlclientInitFailure, WL.Utils.formatString(WL.ClientMessages.browserIsNotSupported, WL.BrowserDetect.browser + ' ' + WL.BrowserDetect.version));
	}

	function onDisabledCookies(response) {
		showDialog(WL.ClientMessages.wlclientInitFailure, WL.ClientMessages.cookiesAreDisabled, true, false, response);
	}

	function onUserInstanceAccessViolation(response) {
		showDialog(WL.ClientMessages.wlclientInitFailure, WL.ClientMessages.userInstanceAccessViolationException, false, false, response);
	}

	function isLoginOnStartup() {
		return getAppProp(WL.AppProp.APP_LOGIN_TYPE) === WL.AppLoginType.LOGIN_ON_STARTUP;
	}

	function onInitSuccess(transport) {
		userInfo = transport.responseJSON.userInfo;
		gadgetProps = transport.responseJSON.gadgetProps;
		userPrefs = transport.responseJSON.userPrefs;
		finalizeInit();
	}

	function onInitFailure(transport) {
		showWidgetContent();
		hideBusy();
		initOptions.onFailure(new WL.FailResponse(transport, initOptions.invocationContext));
	}
	
	function finalizeInit() {
		showWidgetContent();
		hideBusy();

		switch (getEnv()) {
			case WL.Env.IGOOGLE:
				GadgetCAPI.init(getAppProp(WL.AppProp.IID));
				break;
	    
			case WL.Env.IPHONE:
				WL.Utils.checkForInnerAppUpdate();
				break;
		}

		if (WL.EnvProfile.isEnabled(WL.EPField.WEB)) {
			initResizeHandler();
		}

		WL.Logger.debug('before: app init onSuccess');
		initOptions.onSuccess(new WL.Response({}, initOptions.invocationContext));
		WL.Logger.debug('after: app init onSuccess');

		if (getEnv() === WL.Env.VISTA_SIDEBAR) {
			// In vista - check initial dock state
			if (System.Gadget.docked) {
				onWLDock();
			} else {
				onWLUndock();
			}
		}

		isInitialized = true;
		WL.Logger.debug('wlclient init success');
	}

	function onMobileConnectivityCheckFailure() {
		var res = new WL.Response({}, initOptions.invocationContext);
		res.errorCode = WL.ErrorCode.UNRESPONSIVE_HOST;
		res.errorMsg = WL.ClientMessages.noInternet;
		res.userMsg = res.errorMsg;
		res.recoverable = true;
		showWidgetContent();
		hideBusy();
		setConnected(false);

		initOptions.onFailure(res);
	}

	function setConnected(isConnected) {
		if (_isConnected !== isConnected) {
			_isConnected = isConnected;
			WL.Utils.dispatchWLEvent(_isConnected ? WL.Events.WORKLIGHT_IS_CONNECTED : WL.Events.WORKLIGHT_IS_DISCONNECTED);
		}
	}

	var AdobeAir = {
		minimizeCommand : null,
		restoreCommand : null
	};

	function initAdobeAir() {
		WLJSX.bind(document.body, 'mousedown', onAIRNativeMove.bindAsEventListener(this));

		// Add Tray Icon and Menu
		var iconLoadComplete = function(event) {
			var eventTarget = WLJSX.eventTarget(event);
			air.NativeApplication.nativeApplication.icon.bitmaps = [eventTarget.content.bitmapData];
		};
		var iconLoad = new air.Loader();
		var iconMenu = new air.NativeMenu();
	
		// Minimize Command
		AdobeAir.minimizeCommand = iconMenu.addItem(new air.NativeMenuItem(WL.ClientMessages.minimize));
		AdobeAir.minimizeCommand.addEventListener(air.Event.SELECT, function(event) {
			WL.Client.minimize();
		});

		// Restore Command
		AdobeAir.restoreCommand = iconMenu.addItem(new air.NativeMenuItem(WL.ClientMessages.restore));
		AdobeAir.restoreCommand.addEventListener(air.Event.SELECT, function(event) {
			WL.Client.restore();
		});

		// Exit Command
		var exitCommand = iconMenu.addItem(new air.NativeMenuItem(WL.ClientMessages.exit));
		exitCommand.addEventListener(air.Event.SELECT, function(event) {
			if (WL.Client.onBeforeClose) {
				WL.Client.onBeforeClose();
			}
			WL.Client.close();
		});

	// Restore the app if the desktop icon was clicked.
		air.NativeApplication.nativeApplication.addEventListener(air.InvokeEvent.INVOKE, function(event) {
			WL.Client.restore();
		});

		window.nativeWindow.addEventListener(air.NativeWindowDisplayStateEvent.DISPLAY_STATE_CHANGING, function(event) {
			setMinimized(!isMinimized);
		});

		if (air.NativeApplication.supportsSystemTrayIcon) {
			iconLoad.contentLoaderInfo.addEventListener(air.Event.COMPLETE, iconLoadComplete);
			iconLoad.load(new air.URLRequest(getAppProp(WL.AppProp.AIR_ICON_16x16_PATH)));
			air.NativeApplication.nativeApplication.icon.tooltip = getAppProp(WL.AppProp.APP_DISPLAY_NAME);
			air.NativeApplication.nativeApplication.icon.menu = iconMenu;
			air.NativeApplication.nativeApplication.icon.addEventListener(window.runtime.flash.events.MouseEvent.CLICK, function(event) {
				if (isMinimized) {
					WL.Client.restore();
				} else {
					WL.Client.minimize();
				}
			});
		}
		if (air.NativeApplication.supportsDockIcon) {
			iconLoad.contentLoaderInfo.addEventListener(air.Event.COMPLETE, iconLoadComplete);
			iconLoad.load(new air.URLRequest(getAppProp(WL.AppProp.AIR_ICON_128x128_PATH)));
			air.NativeApplication.nativeApplication.icon.menu = iconMenu;
		}

		setMinimized(true);
	}

	function setMinimized(isMini) {
		isMinimized = isMini;
		AdobeAir.minimizeCommand.enabled = !isMinimized;
		AdobeAir.restoreCommand.enabled = isMinimized;
	}

	function onAuthStart() {
		isLoginActive = true;
		if (isContentOnBody) {
			initOptions.authenticator.onShowLogin();
		} else {
			if (getEnv() === WL.Env.VISTA_SIDEBAR && !System.Gadget.docked) {
				(typeof (contentPort.hide) === 'function') ? contentPort.hide() : WLJSX.hide(contentPort);
				hideBusy();
				setAuthStyleOnBody();
				(typeof (authPort.show) === 'function') ? authPort.show() : WLJSX.show(authPort);
			} else {
				// In the normal case, the authenticator contains the onShowLogin() method
				if (initOptions.authenticator && initOptions.authenticator.onShowLogin) {
					initOptions.authenticator.onShowLogin(contentPort, authPort);
				}
				// For applications prior v4.1.3 that were upgraded and doesn't have the onShowLogin()
				else {
					(typeof (contentPort.hide) === 'function') ? contentPort.hide() : WLJSX.hide(contentPort);
					(typeof (authPort.show) === 'function') ? authPort.show() : WLJSX.show(authPort);
				}
			}
		}
		hideBusy();
	}

	function onAuthEnd() {
		// fix bug 3528 - call to undefined authenticator object,
		// caused by calling this method in connect also without authentication
		var isAuthenticatorUndefined = initOptions.authenticator === 'undefined' || initOptions.authenticator === null;
		if (isAuthenticatorUndefined) {
			return;
		}

		if (isContentOnBody) {
			initOptions.authenticator.onHideLogin();
		} else {
			if (!authPort) {
				return;
			}
			if (getEnv() !== WL.Env.VISTA_SIDEBAR || !System.Gadget.docked) {
				// In the normal case, the authenticator contains the onHideLogin() method
				if (initOptions.authenticator && initOptions.authenticator.onHideLogin) {
					initOptions.authenticator.onHideLogin(contentPort, authPort);
				}
				// For applications prior v4.1.3 that were upgraded and doesn't have the onHideLogin()
				else {
					(typeof (authPort.hide) === 'function') ? authPort.hide() : WLJSX.hide(authPort);
					(typeof (contentPort.show) === 'function') ? contentPort.show() : WLJSX.show(contentPort);
				}
			} else {
				(typeof (authPort.hide) === 'function') ? authPort.hide() : WLJSX.hide(authPort);
			}
		}
		isLoginActive = false;
	}

	/**
	 * Activates a login on demand to the server or facebook.
	 * @param realm, type string or null. If null is passed the deployment configured realm is used.
	 * @param options, type Options.
	 */
	function login(realm, options) {
		var loginDisplayType = getAppProp(WL.AppProp.LOGIN_DISPLAY_TYPE);
		switch (loginDisplayType) {
			case WL.LoginDisplayType.POPUP:
				handlePopupLogin();
				break;
			case WL.LoginDisplayType.EMBEDDED:
				handleEmbeddedLogin();
				break;
		}

		// .................................... Handle Embedded Login .......................................
		function handleEmbeddedLogin() {
			function onEmbeddedLoginSuccess(transport) {
				// Login returns userInfo.
				WLJSX.Object.extend(userInfo, transport.responseJSON);
				options.onSuccess(new WL.Response(transport, options.invocationContext));
			}

			function onEmbeddedLoginFailure(transport) {
				options.onFailure(new WL.FailResponse(transport, options.invocationContext));
			}

			new WLJSX.Ajax.WLRequest(REQ_PATH_LOGIN, {
				method : 'post',
				parameters : {
					realm : realm
				},
				onSuccess : onEmbeddedLoginSuccess,
				onFailure : onEmbeddedLoginFailure
			});
		}

		// .................................... Handle Popup Login .......................................
		function handlePopupLogin() {
			function isPollingDurationOver() {
				var currentTime = new Date();
				var ellapsedSecs = (currentTime.getTime() - loginCheckStartTime.getTime()) / 1000;

				return ellapsedSecs > LOGIN_AUTH_CHECK_POLLING_DURATION_IN_SEC;
			}

			function onGetUserInfoSuccess(transport) {
				WLJSX.Object.extend(userInfo, transport.responseJSON);
				if (WL.Client.isUserAuthenticated(realm)) {
					loginCheckPeriodicalExecuter.stop();
					loginCheckPeriodicalExecuter = null;
					options.onSuccess(new WL.Response(transport, options.invocationContext));
				} else if (!(isDesktopEnvironment() && !isPollingDurationOver())) {
					loginCheckPeriodicalExecuter.stop();
					loginCheckPeriodicalExecuter = null;
					options.onFailure(new WL.FailResponse(transport, options.invocationContext));
				}
			}

			function onGetUserInfoFailure(transport) {
				loginCheckPeriodicalExecuter.stop();
				loginCheckPeriodicalExecuter = null;
				options.onFailure(new WL.FailResponse(transport, options.invocationContext));
			}			

			// In desktop cases we cannot poll on the window - we poll for 1 minute and check if
			// the authentication status changed. If after 1 minute the user is still not
			// authenticated, onFailure is called.
			function checkAuthStatus() {
				WL.Logger.debug("handlePopupLogin polling wlserver authStatus");
				new WLJSX.Ajax.WLRequest(REQ_PATH_GET_USER_INFO, {
					onSuccess : onGetUserInfoSuccess,
					onFailure : onGetUserInfoFailure,
					timeout : getAppProp(WL.AppProp.WLCLIENT_TIMEOUT_IN_MILLIS)
				});
			}

			loginCheckStartTime = new Date();

			var popupOptions = {
					width : getAppProp(WL.AppProp.LOGIN_POPUP_WIDTH),
					height : getAppProp(WL.AppProp.LOGIN_POPUP_HEIGHT)
			};
			if (realm.substr(0,8) == 'facebook') {
				WLJSX.Object.extend(popupOptions, WL.FBRealmPopupOptions);
			}

			// If login is called while polling by previous login -
			// make sure we stop polling.
			if (loginCheckPeriodicalExecuter !== null) {
				loginCheckPeriodicalExecuter.stop();
			}
			var loginURL = WL.Utils.createAPIRequestURL(REQ_PATH_LOGIN) + "?" + REQ_PARAM_LOGIN_REALM + "=" + realm + "&" + REQ_PARAM_JSESSION_ID + "=" + WL.CookieManager.getJSessionID();

			var loginPopupWindow = WL.App.openURL(loginURL, "loginPopupWindow", "height=" + popupOptions.height + "," + "width=" + popupOptions.width + "," + "location=1,status=0,toolbar=0,resizable=0,scrollbars=0,menubar=0,screenX=100,screenY=100");
			
			// In web cases - we poll on the popup window to check if its closed.
			// When its closed we check if the authentication status for the realm
			// changed.
			function checkPopup() {
				if (loginPopupWindow !== null && loginPopupWindow.closed) {
					new WLJSX.Ajax.WLRequest(REQ_PATH_GET_USER_INFO, {
						onSuccess : onGetUserInfoSuccess,
						onFailure : onGetUserInfoFailure,
						timeout : getAppProp(WL.AppProp.WLCLIENT_TIMEOUT_IN_MILLIS)
					});
				}
			}
			
			if (isDesktopEnvironment()) {
				loginCheckPeriodicalExecuter = new WLJSX.PeriodicalExecuter(checkAuthStatus, LOGIN_AUTH_CHECK_POLLING_INTERVAL_IN_SEC);
			} else {
				loginCheckPeriodicalExecuter = new WLJSX.PeriodicalExecuter(checkPopup, LOGIN_POPUP_CHECK_INTERVAL_IN_SEC);
			}
		}
	}	

	function sendHeartBeat() {

		new WLJSX.Ajax.WLRequest(REQ_PATH_HEART_BEAT, {
			onSuccess : function() {
			},
			onFailure : function() {
			},
			timeout : getAppProp(WL.AppProp.WLCLIENT_TIMEOUT_IN_MILLIS)
		});
	}

	function onWLShow() {
		if (WLJSX.Object.isFunction(WL.Client.onShow)) {
			WL.Client.onShow();
		}
	}

	function onWLHide() {
		if (WLJSX.Object.isFunction(WL.Client.onHide)) {
			WL.Client.onHide();
		}
	}

	function onWLDock() {
		if (authPort) {
			(typeof (authPort.hide) === 'function') ? authPort.hide() : WLJSX.hide(authPort);
		}

		// hide the content
		var contentToHide = WLJSX.$('DIV_ID_UNDOCK_CONTENT');
		WLJSX.addClass(contentToHide, 'hide');

		if (WLJSX.Object.isFunction(WL.Client.onDock)) {
			isDefaultDockActivated = false;
			WL.Client.onDock();
		} else if (!isDefaultDockActivated) {
			defaultDockHandler();
			isDefaultDockActivated = true;
		}
	}

	function onWLUndock() {
		if (isLoginActive) {
			setAuthStyleOnBody();
		} else {
			setContentStyleOnBody();
			var contentToUnhide = WLJSX.$('DIV_ID_UNDOCK_CONTENT');
			WLJSX.removeClass(contentToUnhide, 'hide');
		}

		if (!isDefaultDockActivated && WLJSX.Object.isFunction(WL.Client.onUndock)) {
			// App is responsible only for cleanup
			WL.Client.onUndock();
		} else {
			isDefaultDockActivated = false;
		}

		// If the busy indicator is shown - hide and show it again, so that it will get the correct position
		if (busyIndicator && busyIndicator.isVisible()) {
			busyIndicator.hide();
			busyIndicator.show();
		}
		if (authPort) {
			(typeof (authPort.show) === 'function') ? authPort.show() : WLJSX.show(authPort);
		}

		// If the simple dialog is shown - hide and show it again, so that it will get the correct position
		var wlDialogContainer = WLJSX.$('WLdialogContainer');
		if (wlDialogContainer && wlDialogContainer.style.display === 'block') {
			WL.SimpleDialog.hide();
			WL.SimpleDialog.show();
		}

	}

	// Vista Only - Take the innerHTML from the body and copy it to new div for undock purpose
	function createUndockContent() {
		var undockContent = WLJSX.$(DIV_ID_UNDOCK_CONTENT);
		if (!undockContent) {
			// hiding the busy indicator since its HTML will be moved to the contentInnerHTML and it will be broken.
			hideBusy();
			var contentDiv = WLJSX.$(DIV_ID_CONTENT);
			// get the inner HTML of the content
			var contentInnerHTML = WLJSX.html(contentDiv);
			// create a new div that will contain the HTML of the content
			var undockContent = WLJSX.newElement('<div/>', {
				id : DIV_ID_UNDOCK_CONTENT
			});

			WLJSX.css(undockContent, {
				width : getAppProp(WL.AppProp.WIDTH),
				height : getAppProp(WL.AppProp.HEIGHT),
				backgroundImage : document.body.currentStyle.backgroundImage,
				backgroundColor : document.body.currentStyle.backgroundColor,
				backgroundRepeat : document.body.currentStyle.backgroundRepeat,
				padding : document.body.currentStyle.padding,
				margin : document.body.currentStyle.margin
			});

			// move the inner HTML of the content to the new div
			WLJSX.html(undockContent, contentInnerHTML);
			// empty the inner HTML of the content
			WLJSX.empty(contentDiv);
			// append the new div with the inner HTML of the content to the content
			WLJSX.append(contentDiv, undockContent);
		}
	}

	function defaultDockHandler() {
		setDockStyleOnBody();
	}

	function setStylePropertyOnElement(elm, style, property) {
		if (!WLJSX.Object.isUndefined(style[property])) {
			elm.style[property] = style[property];
		}
	}
	
	function setVistaBodyStyle(style) {
		//IMPORTANT: Width & Height must be set before background otherwise alfa-channel is broken.
		setStylePropertyOnElement(document.body, style, 'width');
		setStylePropertyOnElement(document.body, style, 'height');
		setStylePropertyOnElement(document.body, style, 'margin');
		setStylePropertyOnElement(document.body, style, 'padding');

		// no suport for skins right now
		// the builder will fail if there is no dock.png in the images folder, so it is safe to assume that it is there.	

		System.Gadget.background = style.backgroundImage;
	}

	/**
	 * @deprecated - since V4.2
	 */
	function setContentStyleOnBody() {
		if (vistaBodyStyleInContent === null) {
			vistaBodyStyleInContent = {};
			vistaBodyStyleInContent.width = getAppProp(WL.AppProp.WIDTH);
			vistaBodyStyleInContent.height = getAppProp(WL.AppProp.HEIGHT);
			vistaBodyStyleInContent.backgroundImage = contentPort.currentStyle.backgroundImage;
			vistaBodyStyleInContent.backgroundColor = contentPort.currentStyle.backgroundColor;
			vistaBodyStyleInContent.backgroundRepeat = contentPort.currentStyle.backgroundRepeat;
			vistaBodyStyleInContent.padding = document.body.currentStyle.padding;
			vistaBodyStyleInContent.margin = document.body.currentStyle.margin;
			if (!WLJSX.Object.isUndefined(contentPort.currentStyle.backgroundAttachment)) {
				vistaBodyStyleInContent.backgroundAttachment = contentPort.currentStyle.backgroundAttachment;
			}
			if (!WLJSX.Object.isUndefined(contentPort.currentStyle.backgroundPositionX)) {
				vistaBodyStyleInContent.backgroundPositionX = contentPort.currentStyle.backgroundPositionX;
			}
			if (!WLJSX.Object.isUndefined(contentPort.currentStyle.backgroundPositionY)) {
				vistaBodyStyleInContent.backgroundPositionY = contentPort.currentStyle.backgroundPositionY;
			}
		}
		// Must remove these properties from the content element before undock.
		contentPort.style.backgroundImage = 'none';
		contentPort.style.backgroundColor = 'transparent';
		contentPort.style.backgroundRepeat = 'no-repeat';

		setVistaBodyStyle(vistaBodyStyleInContent);
	}

	/**
	 * @deprecated - since V4.2
	 */
	function setAuthStyleOnBody() {
		if (vistaBodyStyleInAuth === null) {
			vistaBodyStyleInAuth = {};
			vistaBodyStyleInAuth.width = authPort.currentStyle.width;
			vistaBodyStyleInAuth.height = authPort.currentStyle.height;
			vistaBodyStyleInAuth.backgroundImage = authPort.currentStyle.backgroundImage;
			vistaBodyStyleInAuth.backgroundColor = authPort.currentStyle.backgroundColor;
			vistaBodyStyleInAuth.backgroundRepeat = authPort.currentStyle.backgroundRepeat;
			vistaBodyStyleInAuth.padding = document.body.currentStyle.padding;
			vistaBodyStyleInAuth.margin = document.body.currentStyle.margin;
			if (!WLJSX.Object.isUndefined(authPort.currentStyle.backgroundAttachment)) {
				vistaBodyStyleInAuth.backgroundAttachment = authPort.currentStyle.backgroundAttachment;
			}
			if (!WLJSX.Object.isUndefined(authPort.currentStyle.backgroundPositionX)) {
				vistaBodyStyleInAuth.backgroundPositionX = authPort.currentStyle.backgroundPositionX;
			}
			if (!WLJSX.Object.isUndefined(authPort.currentStyle.backgroundPositionY)) {
				vistaBodyStyleInAuth.backgroundPositionY = authPort.currentStyle.backgroundPositionY;
			}

			// Must remove these properties from the auth element.
			authPort.style.backgroundImage = 'none';
			authPort.style.backgroundColor = 'transparent';
			authPort.style.backgroundRepeat = 'no-repeat';
		}
		setVistaBodyStyle(vistaBodyStyleInAuth);
	}

	function setDockStyleOnBody() {
		if (vistaBodyStyleInDock === null) {
			vistaBodyStyleInDock = {
				width : getAppProp(WL.AppProp.VISTA_DOCK_IMAGE_WIDTH) + 'px',
				height : getAppProp(WL.AppProp.VISTA_DOCK_IMAGE_HEIGHT) + 'px',
				margin : '0',
				padding : '0',
				backgroundImage : 'url(www/default/' + getAppProp(WL.AppProp.VISTA_DOCK_IMAGE_PATH) + ')',
				backgroundColor : 'transparent',
				backgroundRepeat : 'no-repeat',
				backgroundPositionX : 'center',
				backgroundPositionY : 'center'
			};
		}
		setVistaBodyStyle(vistaBodyStyleInDock);
	}

	function showWidgetContent() {

		// Android native elements
		if (WL.optionsMenu) {
			WL.optionsMenu.setVisible(true);
		}
		if (WL.TabBar) {
			WL.TabBar.setVisible(true);
		}

		if (getEnv() === WL.Env.VISTA_SIDEBAR && !System.Gadget.docked) {
			// In Vista undocked - when the authentication has finished - restore the body style properties
			setContentStyleOnBody();
			(typeof (contentPort.show) === 'function') ? contentPort.show() : WLJSX.show(contentPort);
		} else {
			(typeof (contentPort.show) === 'function') ? contentPort.show() : WLJSX.show(contentPort);
		}
	}

	function hideBusy() {
		if (isIOSEnv()) {
			cordova.exec(null, null, "SplashScreen", "hide", []);
		}
		if (busyIndicator && busyIndicator.isVisible() || WL.EnvProfile.isEnabled(WL.EPField.USES_CORDOVA)) {
			if (WL.EnvProfile.isEnabled(WL.EPField.MOBILE)) {
				if (busyIndicator.isVisible()) {
					WL.Utils.removeBlackDiv();
				}
			}
			busyIndicator.hide();
		}
	}

	function showBusy() {
		if (busyIndicator && !busyIndicator.isVisible()) {
			var env = WL.Client.getEnvironment();
			if (WL.EnvProfile.isEnabled(WL.EPField.MOBILE) && env != WL.Env.WINDOWS_PHONE && env != WL.Env.BLACKBERRY) {
				WL.Utils.addBlackDiv();
			}
			busyIndicator.show();
		}
	}

	function initResizeHandler() {
		WLJSX.bind(document.onresize ? document : window, 'resize', onResizeGadget);
		onResizeGadget();
	}

	function getBlockingDiv() {
		if (blockingDiv === null) {
			blockingDiv = WLJSX.newElement('<div/>', {
				'id' : 'blockOuter',
				'class' : 'hide'
			});
			var blockingDivContent = WLJSX.newElement('<div/>', {
				'id' : 'blockInner'
			});
			WLJSX.append(blockingDiv, blockingDivContent);
			WLJSX.append(document.body, blockingDiv);
		}
		return blockingDiv;
	}

	function showBlockingDiv(isShow, zIndex) {
		var div = getBlockingDiv();
		if (isShow) {
			div.className = 'show';
			if (zIndex) {
				div.style.zIndex = zIndex;
			}
		} else {
			div.className = 'hide';
			div.style.zIndex = '';
			setBlockingDivContent(null);
		}
	}

	function setBlockingDivContent(content) {
		var div = getBlockingDiv();
		if (div.firstChild) {
			div.removeChild(div.firstChild);
		}
		if (content !== null) {
			div.appendChild(content);
		}
	}

	function onResizeGadget() {
		if (WLJSX.getViewportWidth() === undefined || // In mobile web viewport width is undefined.
				WLJSX.getViewportWidth() >= initOptions.minAppWidth) {
			showBlockingDiv(false);
		} else {
			var divContent = document.createTextNode(WL.ClientMessages.expandWindow);
			setBlockingDivContent(divContent);
			showBlockingDiv(true);
		}
	}

	function onAIRNativeMove(element) {
		var scrollableTags = ['DIV', 'UL'];

		// Currently, scrollers only appear in DIVs
		if (scrollableTags.indexOf(element.tagName) > -1) {
			var css = document.defaultView.getComputedStyle(element, null);
			var styleOverflow = css === null ? '' : css.overflow;
			var styleOverflowY = css === null ? '' : css.overflowY;
			var styleOverflowX = css === null ? '' : css.overflowX;

			// When clicking on the scrollbar the overflow is always 'auto' and not 'visible'
			if (styleOverflow === 'auto' || styleOverflowY === 'auto' || styleOverflowX === 'auto' || styleOverflow === 'scroll' || styleOverflowY === 'scroll' || styleOverflowX === 'scroll') {
				return;
			}
		} // Allow selecting content of text box
		else if (element.tagName === 'INPUT' && element.type === 'text') {
			return;
		}
		window.nativeWindow.startMove();
	}

	function getUserInfoValue(key, realm) {
		var value = null;
		if (!realm) {
			realm = getAppProp(WL.AppProp.LOGIN_REALM);
		}
		if (typeof userInfo[realm] !== 'undefined') {
			value = (userInfo[realm])[key];
		} else {
			WL.Logger.error("Unknown realm [" + realm + "]. null returned for key: " + key);
		}
		return value;
	}

	function showDialog(title, messageText, allowReload, allowDetails, response) {
		hideBusy();
		WL.DiagnosticDialog.showDialog(title, messageText, allowReload, allowDetails, response);
	}
	
	/*
	 * Extends the async method options with default options. Default options are added if missing but do not
	 * override existing options.
	 */
	function extendWithDefaultOptions(options) {
		return WL.Utils.extend(options || {}, defaultOptions);
	}

	function replaceGadgetMessages() {
		if (initOptions.messages) {
			WL_I18N_MESSAGES = initOptions.messages;
		} else if (typeof Messages != 'undefined') {
			WL_I18N_MESSAGES = Messages;
		}

		if (!WL_I18N_MESSAGES) {
			WL.Logger.debug("Application did not define an i18n messages object, skipping translation.");
			return;
		}
		// Replace all the text in the gadget with the appropriate i18n text
		WL.Utils.replaceElementsText();
	}

	function isDesktopEnvironment() {
		return WL.EnvProfile.isEnabled(WL.EPField.DESKTOP);
	}

	function getEnv() {
		return WL.StaticAppProps.ENVIRONMENT;
	}

	function isIOSEnv() {
		return WL.EnvProfile.isEnabled(WL.EPField.ISIOS);
	}

	function getAppProp(key) {
		return gadgetProps[key] || WL.StaticAppProps[key];
	}

	function onEnvInit(options) {
		if (contentPort === null || typeof contentPort == "undefined") {
			throw new Error("Missing element with 'content' id in the html.");
		}
		// Must override the prototype hide/show to override the css' display:none.
		contentPort.show = function() {

			// Fix for Webkit bug: form controls are not reacting after content .hide() .show().
			// The workaround is to add some whitespace to the div.
			if (WL.Client.getEnvironment() === WL.Env.ANDROID) {
				WLJSX.append(contentPort, '<!-- -->');
			}
			contentPort.style.display = 'block';
		};
		contentPort.hide = function() {
			contentPort.style.display = '';
		};

		replaceGadgetMessages();

		if (WL.BrowserDetect.isExplorer && WL.BrowserDetect.version == '6') {
			var unsupportedBrowserResponse = new WL.Response({}, options.invocationContext);
			unsupportedBrowserResponse.errorCode = WL.ErrorCode.UNSUPPORTED_BROWSER;
			unsupportedBrowserResponse.errorMsg = WL.Utils.formatString(WL.ClientMessages.browserIsNotSupported, WL.BrowserDetect.browser + ' ' + WL.BrowserDetect.version);
			unsupportedBrowserResponse.userMsg = unsupportedBrowserResponse.errorMsg;
			showWidgetContent();
			initOptions.onFailure(unsupportedBrowserResponse);
			return;
		}

		if (getEnv() === WL.Env.VISTA_SIDEBAR) {
			createUndockContent();
		}

		if (initOptions.showLogger) {
			WL.Logger.__init((getEnv() === WL.Env.VISTA_SIDEBAR) ? DIV_ID_UNDOCK_CONTENT : DIV_ID_CONTENT);
		}

		WL.Logger.debug('wlclient init started');

		// if container was not defined in the busyOptions - send null (so that the whole viewport/body will be used)

		busyIndicator = new WL.BusyIndicator(initOptions.busyOptions ? initOptions.busyOptions.container : null, initOptions.busyOptions);
		if (!isIOSEnv()) {
			showBusy();
		}

		WLJSX.Ajax.WLRequest.options.timeout = initOptions.timeout;
		if (WL.Client.getEnvironment() != WL.Env.MOBILE_WEB) {
			WLJSX.Ajax.WLRequest.setConnected = setConnected.bind(this);
		} else {
			WLJSX.Ajax.WLRequest.setConnected = function() {
			};
		}

		// Authenticator initialization
		if (getAppProp(WL.AppProp.APP_LOGIN_TYPE) !== WL.AppLoginType.NO_LOGIN) {
			if (!initOptions.authenticator && typeof Authenticator !== 'undefined') {
				initOptions.authenticator = Authenticator;
			}

			// verify initOptions.authenticator object exists
			if (initOptions.authenticator === null) {
				var msg = 'This app requires authentication, but no authentication code has been implemented.';
				WL.Logger.error(msg);
				throw new Error(msg);
			}
			// ensure initOptions.authenticator contains required methods
			else {
				//verify init, isLoginFormResponse, onBeforeLogin methods are declared in initOptions.authenticator
				if (!initOptions.authenticator.init || !initOptions.authenticator.isLoginFormResponse || !initOptions.authenticator.onBeforeLogin) {
					var msg = 'Authentication code has been partially implemented. Make sure you implement the following Authentication methods: init(), isLoginFormResponse(), onBeforeLogin()';
					WL.Logger.error(msg);
					throw new Error(msg);
				}

				// verify onShowLogin, onHideLogin methods are declared in initOptions.authenticator
				if (isContentOnBody && (!initOptions.authenticator.onShowLogin || !initOptions.authenticator.onHideLogin)) {
					var msg = 'Authentication code has been partially implemented. Make sure you implement the following Authentication methods: onShowLogin(), onHideLogin()';
					WL.Logger.error(msg);
					throw new Error(msg);
				}
			}

			WLJSX.Ajax.WLRequest.options.onAuthentication = WL.AuthHandler.handleAuth;
			WLJSX.Ajax.WLRequest.options.isAuthResponse = WL.AuthHandler.isAuthResponse;
			WL.AuthHandler.initialize(initOptions.authenticator, showBusy, hideBusy, onAuthStart, onAuthEnd);

			authPort = WLJSX.$('auth');
			if (!isContentOnBody) {
				if (!authPort) {
					throw new Error("Missing element with 'auth' id in the HTML.");
				}
				// Must override the prototype hide/show to override the css' display:none.
				authPort.show = function() {
					authPort.style.display = 'block';
				};
				authPort.hide = function() {
					authPort.style.display = '';
				};
			}

			initOptions.authenticator.init();
		}
		WL.CookieManager.init(getAppProp(WL.AppProp.APP_DISPLAY_NAME), getAppProp(WL.AppProp.ENVIRONMENT), getAppProp(WL.AppProp.IID));

		if (!WL.CookieManager.areCookiesEnabled()) {
			var disabledCookiesResponse = new WL.Response({}, options.invocationContext);
			disabledCookiesResponse.errorCode = WL.ErrorCode.DISABLED_COOKIES;
			disabledCookiesResponse.errorMsg = WL.Utils.formatString(WL.ClientMessages.cookiesAreDisabled);
			disabledCookiesResponse.userMsg = disabledCookiesResponse.errorMsg;
			showWidgetContent();
			initOptions.onFailure(disabledCookiesResponse);
			return;
		}
		switch (getEnv()) {
			case WL.Env.ANDROID:
				WL.OptionsMenu.init();
				break;
			case WL.Env.OSX_DASHBOARD:
				widget.onshow = onWLShow;
				widget.onhide = onWLHide;
				break;
			case WL.Env.VISTA_SIDEBAR:
				System.Gadget.onUndock = onWLUndock;
				System.Gadget.onDock = onWLDock;
				if (System.Gadget.docked) {
					isDefaultDockActivated = false;
					onWLDock();
				} else {
					isDefaultDockActivated = true;
					onWLUndock();
				}
				break;
			case WL.Env.ADOBE_AIR:
				initAdobeAir();
				break;
			default:
				break;
		}
	}

    // ................ Public API methods .....................

    // ...... API variables ......

    /**
     * Note: This method is only applicable to widgets running on Apple OS X Dashboard.
     * 
     * Widgets running on Apple OS X Dashboard can be shown or hidden by pressing F12 on the Apple computer
     * keyboard. Developers of OS X Dashboard widgets are instructed to stop any background processing while
     * the widgets are hidden.
     * 
     * To specify the app's behavior on showing and hiding it, provide an implementation for the
     * WL.Client.onShow and WL.Client.onHide methods. Neither of these methods should receive any parameters.
     */
	this.onShow = null;

    /**
     * Note: This method is only applicable to widgets running on Apple OS X Dashboard.
     * 
     * Widgets running on Apple OS X Dashboard can be shown or hidden by pressing F12 on the Apple computer
     * keyboard. Developers of OS X Dashboard widgets are instructed to stop any background processing while
     * the widgets are hidden.
     * 
     * To specify the app's behavior on showing and hiding it, provide an implementation for the
     * WL.Client.onShow and WL.Client.onHide methods. Neither of these methods should receive any parameters.
     */
	this.onHide = null;

    /**
     * Note: This method is only applicable to widgets running in Vista Sidebar.
     * 
     * To specify the app's behavior on docking and undocking, provide an implementation for the
     * WL.Client.onDock and WL.Client.onUndock callback functions. Neither of these methods should receive any
     * parameters.
     */
	this.onDock = null;

    /**
     * Note: This method is only applicable to widgets running in Vista Sidebar.
     * 
     * To specify the app's behavior on docking and undocking, provide an implementation for the
     * WL.Client.onDock and WL.Client.onUndock callback functions. Neither of these methods should receive any
     * parameters.
     */
	this.onUndock = null;

    /**
     * Note: This method is only applicable to widgets running in Adobe Air.
     * 
     * To specify the app's behavior on before close, provide an implementation for the
     * WL.Client.onBeforeClose callback functions Neither of these methods should receive any parameters.
     */
	this.onBeforeClose = null;

    /**
     * Initializes the Application. The method must before the WL.Client can be activated. The call must be
     * placed at the HTML body onload event.
     * @param options, hash; possible attributes: onSuccess, function : The gadget implementation initializing
     *                function. onFailure, function : timeout, int : The default server callback timeout.
     *                showLogger, boolean : Enables the logger dialog when TRUE or DISABLES when FALSE
     *                minAppWidth, int : The minimum application width. If the gadget is minimized below this
     *                width, a "please expand" message is displayed. busyOptions : WL.BusyIndicator options
     *                object (see WL.BusyIndicator for details). connectOnStartup : boolean to declare whether
     *                the app should connect on startup or not.
     */
	this.init = function(options) {
		WL.Validators.enableValidation();
		WL.Validators.validateOptions({
			onSuccess : 'function',
			onFailure : 'function',
			onConnectionFailure : 'function',
			showLogger : 'boolean',
			updateSilently : 'boolean',
			timeout : 'number',
			minAppWidth : 'number',
			heartBeatIntervalInSecs : 'number',
			onUnsupportedVersion : 'function',
			onRequestTimeout : 'function',
			onUnsupportedBrowser : 'function',
			onDisabledCookies : 'function',
			onUserInstanceAccessViolation : 'function',
			onErrorAppVersionAccessDenial : 'function',
			onGetCustomDeviceProperties : 'function',
			onGetCustomDeviceProvisioningProperties : 'function',
			authenticator : 'object',
			messages : 'object',
			busyOptions : 'object',
			validateArguments : 'boolean',
			connectOnStartup : 'boolean'
		}, options, "WL.Client.init");

		contentPort = WLJSX.$(DIV_ID_CONTENT);
		isContentOnBody = (WLJSX.$('content').tagName.toLowerCase() == "body");
		// initialize runtime enviroment fields
		WL.EnvProfile.initialize(getEnv());

		// WL_SKINLOADER_CHECKSUM entry in checksum.js will appear only for application that has skins
		isAppHasSkinLoaderChecksum = (typeof WL_SKINLOADER_CHECKSUM != 'undefined');

		if (isContentOnBody) {
			if (WL.Client.getEnvironment() == WL.Env.ANDROID) {
				WL.Utils.addBlackDiv();
			}
			(typeof (contentPort.show) === 'function') ? contentPort.show() : WLJSX.show(contentPort);
		}

		// If not declared explicitly, default value of connectOnStartup is true.
		if (typeof options.connectOnStartup === 'undefined' || options.connectOnStartup === null) {
			options.connectOnStartup = true;
		}

		WL.AppProp.WLCLIENT_TIMEOUT_IN_MILLIS = 30000;
		if (!options.timeout) {
			options.timeout = WL.AppProp.WLCLIENT_TIMEOUT_IN_MILLIS;
		}

		// ////////////////////////////////////////////////////////////////
		// Set user's JavaScript initialization code to options.onSuccess
		// ////////////////////////////////////////////////////////////////

		var wlInit = function() {
			if (window.wlEnvInit !== undefined) {
				wlEnvInit();
			} else if (window.wlCommonInit !== undefined) {
				wlCommonInit();
			}
		};

		// before v4.1.3:
		// an onSuccess callback was provided by main html file's onload
		if (options.onSuccess) {
			// before v4.1.3 wlCommonInit was not yet defined.
			// in such case, we define an empty function, because new environments js template expects this method.
			if (window.wlCommonInit === undefined) {
				wlCommonInit = function() {
				};
			}
			// extracting the user's onSuccess to call wlInit after the original onSuccess - so new
			// environments's js code (v4.1.3 and newer) will be invoked.
			var _onSuccess = options.onSuccess;
			options.onSuccess = function() {
				// calls the old onSuccess callback as defined in main html onload
				_onSuccess();
				//calls the new initialization scheme as defined in v4.1.3
				wlInit();
			};
		}
		// starting v4.1.3 -
		else {
			options.onSuccess = wlInit;
		}

		WLJSX.Object.extend(initOptions, options);
		initOptions.validateArguments ? WL.Validators.enableValidation() : WL.Validators.disableValidation();

		var connectOptions = {
			onSuccess : onInitSuccess.bind(this),
			onFailure : function() {
				hideBusy();
				initOptions.onFailure.apply(this, arguments);
			}.bind(this),
			timeout : initOptions.timeout
		};

		// All the devices which are Cordova based have to wait for the 'deviceready' event
		// to make sure that the Cordova functionality is initialized.
		if (WL.EnvProfile.isEnabled(WL.EPField.USES_CORDOVA)) {
			if (WL.Client.getEnvironment() === WL.Env.WINDOWS_PHONE) {
				// Windows Phone 7 does not support custom events
				WLJSX.bind(document, __WL.InternalEvents.REACHABILITY_TEST_SUCCESS, this.connect.bind(this, connectOptions));
				WLJSX.bind(document, __WL.InternalEvents.REACHABILITY_TEST_FAILURE, onMobileConnectivityCheckFailure.bind(this));
			} else {
				document.addEventListener(__WL.InternalEvents.REACHABILITY_TEST_FAILURE, onMobileConnectivityCheckFailure.bind(this), false);
				document.addEventListener(__WL.InternalEvents.REACHABILITY_TEST_SUCCESS, this.connect.bind(this, connectOptions), false);
			}

			var cordovaInit = function(event) {
				
				WL.Logger.debug("ondeviceready event dispatched");
				if (WL.Client.getEnvironment() == WL.Env.ANDROID) {
					// read the version pref
					WL.App.readUserPref ("appVersionPref", cordovaInitCallback, cordovaInitCallback);
					
				} else if ( (WL.Client.getEnvironment() == WL.Env.IPHONE) || (WL.Client.getEnvironment() == WL.Env.IPAD) ) {
					WL.App.getInitParameters("appVersionPref,wlSkinName,wlSkinLoaderChecksum", cordovaInitCallback);
				} else {
					cordovaInitCallback (null);
				}
			};
	    
			var doConnectOnStartUp = function (){
				if (options.connectOnStartup) {
					// through Cordova,
					WL.Utils.wlCheckReachability();
				} else {
					finalizeInit();
				}
			};
			
			var cordovaInitCallback = function(returnedData) {	    	
				onEnvInit(options);
				if (WL.Client.getEnvironment() == WL.Env.ANDROID) {
					if (returnedData !== null && returnedData !== "") {
						WL.StaticAppProps.APP_VERSION = returnedData;
					}
					// In development mode, the application has a settings widget in which the user may alter
					// the application's root url
					// and here the application reads this url, and replaces the static prop
					// WL.StaticAppProps.WORKLIGHT_ROOT_URL
					// __setWLServerAddress for iOS is called within wlgap.ios.js's wlCheckReachability
					// function because it is an asynchronous call.
					
					// Only in Android we should clear the history of the WebView, otherwise when user will
					// press the back button after upgrade he will return to the html page before the upgrade
					if (WL.Env.ANDROID == getEnv()) {
						cordova.exec(null, null, 'Utils', 'clearHistory', []);
					}
				}
				if ( (WL.Client.getEnvironment() == WL.Env.IPHONE) || (WL.Client.getEnvironment() == WL.Env.IPAD) ){			    
					
					WL.StaticAppProps.APP_VERSION = returnedData.appVersionPref;
					WL.StaticAppProps.FREE_SPACE = returnedData.freeSpace;
					WL.StaticAppProps.SKIN_NAME = returnedData.wlSkinName;
					WL.StaticAppProps.SKIN_LOADER_CHECKSUM = returnedData.wlSkinLoaderChecksum;
				}
				if (WL.EnvProfile.isEnabled(WL.EPField.SERVER_ADDRESS_CONFIGURABLE)) {
					WL.App.__setWLServerAddress(doConnectOnStartUp);
				} else {
					doConnectOnStartUp();
				}
				
			};

			// make sure we wait for the 'deviceready' event. If it already has benn fired, PhoneGap.available will be true
			if (typeof cordova != "undefined" && cordova !== null && cordova.available || typeof PhoneGap != "undefined" && PhoneGap.available) {
				cordovaInit();
			} else {
				if (WL.Client.getEnvironment() === WL.Env.WINDOWS_PHONE) {
					// Windows Phone 7 does not support custom events
					WLJSX.bind(document, 'deviceready', cordovaInit.bind(this));
				} else {
					// use setTimeout to ensure all Cordova function (especially navigator.network and
					// naviator.notification) is available
					document.addEventListener('deviceready', function() {
						setTimeout(cordovaInit, 0);
					}, false);
				}
			}

		} else if (getEnv() == WL.Env.BLACKBERRY) {			
			if (typeof worklight != "undefined" && !worklight.utils.hasInternetConncetion()) {
				onMobileConnectivityCheckFailure();
			} else {
				onEnvInit(options);
				if (options.connectOnStartup) {
					this.connect(connectOptions);
				} else {
					finalizeInit();
				}
			}
		} else {
			onEnvInit(options);
			if (options.connectOnStartup) {
				this.connect(connectOptions);
			} else {
				finalizeInit();
			}
		}
    };

    // establishes a session with the worklight server, receiving any block/notify messages that
    // may apply to this application, and other information (i.e. checksum data for direct update).
    this.connect = function(options) {
    	WL.Validators.validateOptions({
    		onSuccess : 'function',
    		onFailure : 'function',
    		timeout : 'number'
    	}, options, 'WL.Client.connect');

    	if (isConnecting) {
    		WL.Logger.error("Cannot invoke WL.Client.connect while it is already executing.");
    		if (options && options.onFailure) {
    			options.onFailure();
    		}
    		return;
    	}

    	options = extendWithDefaultOptions(options);

    	var timeout = getAppProp(WL.AppProp.WLCLIENT_TIMEOUT_IN_MILLIS);
    	if (!WLJSX.Object.isUndefined(options.timeout)) {
    		timeout = options.timeout;
    	}

    	function onConnectSuccess(transport) {
    		userInfo = transport.responseJSON.userInfo;
    		gadgetProps = transport.responseJSON.gadgetProps;
    		userPrefs = transport.responseJSON.userPrefs;

    		// save the login name in the local storage
    		switch (getEnv()) {
    			case WL.Env.BLACKBERRY:
    				if (isLoginOnStartup()) {
    					if (typeof localStorage != "undefined") {
    						__WL.LocalStorage.setValue(WL.UserInfo.USER_NAME, WL.Client.getLoginName());
    					} else {
    						__WL.blackBerryPersister.store(WL.UserInfo.USER_NAME, WL.Client.getLoginName());
    					}
    				}
    				break;
    			case WL.Env.IPHONE:
    			case WL.Env.IPAD:
    			case WL.Env.ANDROID:
    				if (isLoginOnStartup()) {
    					var loginName = WL.Client.getLoginName();
    					if (loginName && loginName != "") {
    						__WL.LocalStorage.setValue(WL.UserInfo.USER_NAME, WL.Client.getLoginName());
    					}
    				}
    				break;
    		}

    		// for desktop environments, display the update version dialog.
    		if (WL.EnvProfile.isEnabled(WL.EPField.DESKTOP) && getAppProp(WL.AppProp.LATEST_VERSION) > getAppProp(WL.AppProp.APP_VERSION)) {
    			var response = new WL.Response({}, initOptions.invocationContext);
    			response.errorCode = WL.ErrorCode.UNSUPPORTED_VERSION;
    			response.appVersion = getAppProp(WL.AppProp.APP_VERSION);
    			response.latestVersion = getAppProp(WL.AppProp.LATEST_VERSION);
    			response.downloadAppURL = getAppProp(WL.AppProp.DOWNLOAD_APP_LINK);
    			response.errorMsg = WL.Utils.formatString(WL.ClientMessages.upgradeGadget, response.appVersion, response.latestVersion);
    			response.userMsg = response.errorMsg;
    			if (initOptions.onUnsupportedVersion) {
    				initOptions.onUnsupportedVersion(response);
    			} else {
    				options.onFailure(response);
    			}
    			return;
    		}

    		if (initOptions.heartBeatIntervalInSecs && initOptions.heartBeatIntervalInSecs > 0 && !heartBeatPeriodicalExecuter) {
    			// Start heartbeat polling.
    			heartBeatPeriodicalExecuter = new WLJSX.PeriodicalExecuter(sendHeartBeat, initOptions.heartBeatIntervalInSecs);
    		}

    		WL.Logger.debug('wlclient connect success');
    		isConnecting = false;

    		if (WL.EnvProfile.isEnabled(WL.EPField.SUPPORT_DIRECT_UPDATE_FROM_SERVER)) {
    			handleDirectUpdate(transport.responseJSON.gadgetProps.directUpdate, transport);
    		} else {
    			options.onSuccess(transport);
    		}
    	}

    	function handleDirectUpdate(updatesJSON, transport) {
    		if (WL._isInnerAppChanged) {
    			return;
    		}
    		var skinHasChanged = false;
    		var oldSkinName = WL.Utils.getCurrentSkinName();

    		// Part I: check if skin loader content has change
    		if (updatesJSON.skinLoaderContent) {
    			eval(updatesJSON.skinLoaderContent); // define method getSkinName()
    			var newSkinName = getSkinName();

    			if (!isAppHasSkinLoaderChecksum) {
    				// this is a special case of application that currently doesn't have
    				// any skins and at the same time there is a new verion on the server that does have.
    				skinHasChanged = true;
    			} else if (oldSkinName != newSkinName) {
    				skinHasChanged = true;
    			}

    			if (skinHasChanged) {
    				// check if the new skin is available on the server
    				if (updatesJSON.availableSkins.indexOf(newSkinName) != -1) {
    					WL.App.writeUserPref('wlSkinName', newSkinName);
    				} else {
    					WL.Logger.error('Cannot load skin ' + newSkinName + ' - Please check skinLoader.js file for errors.');
    					showDialog('Skin Loader Error', 'The application is not supported on this device.', false, false, false);
    				}
    			}

    			// there is a new skin loader so we should save its checksum on the device
    			WL.Utils.setSkinLoaderChecksum(updatesJSON.skinLoaderChecksum);
    		}

    		// Part II: check if there is a direct update to the application
    		if (skinHasChanged || isUpdateRequired(updatesJSON.checksum)) {
    			var freeSpaceOnDeviceMB = (WL.Utils.getFreeSpaceOnDevice() / 1048576).toFixed(2); // convert
    			// Bytes to MB required space on the device (in MB) to download the zip file + extract it (x3)
    			var requiredSizeForUpdateMB = ((3 * updatesJSON.updateSize) / 1048576).toFixed(2);

    			hideBusy();
    			WL.Utils.addBlackDiv();
    			// first check if there is enough space on the device to download the zip file + extract it
    			if (Number(requiredSizeForUpdateMB) > Number(freeSpaceOnDeviceMB)) {
    				var notEnoughSpaceMsg = WL.Utils.formatString(WL.ClientMessages.directUpdateErrorMessageNotEnoughStorage, requiredSizeForUpdateMB, freeSpaceOnDeviceMB);
    				WL.Logger.debug(notEnoughSpaceMsg);
    				WL.SimpleDialog.show(WL.ClientMessages.directUpdateNotificationTitle, notEnoughSpaceMsg, [{
    					text : WL.ClientMessages.tryAgain,
    					handler : sendInitRequest
    				}, {
    					text : WL.ClientMessages.exitApplication,
    					handler : function() {
    						WL.App.close();
    					}
    				}]);
    				if (transport) {
    					finishInitFlow(transport);
    				}
    			} else if (initOptions.updateSilently) {
    				WL.App.update();
    			} else {
    				var fileSizeInMB = (updatesJSON.updateSize / 1048576).toFixed(2);
    				showUpdateConfirmDialog(fileSizeInMB);
    			}
    			// true only during init process
    		} else if (transport) {
    			finishInitFlow(transport);
    		}
    		// internal function to be called directly or via callback
    		function finishInitFlow(transport) {
    			WLJSX.bind(document, 'foreground', onForegroundCallback);
    			options.onSuccess(transport);
    		}
    	}

    	function showUpdateConfirmDialog(fileSizeInMB) {
    		var directUpdateMsg = WL.Utils.formatString(WL.ClientMessages.directUpdateNotificationMessage, fileSizeInMB);
    		// show confirmation dialog with two options: 1. update app 2. leave app.
    		WL.SimpleDialog.show(WL.ClientMessages.directUpdateNotificationTitle, directUpdateMsg, [{
    			text : WL.ClientMessages.update,
    			handler : WL.App.update
    		}, {
    			text : WL.ClientMessages.exit,
    			handler : WL.App.close
    		}]);
    	}

    	function isUpdateRequired(skinChecksum) {
    		return skinChecksum != WL_CHECKSUM.checksum;
    	}

    	function onForegroundCallback() {
    		WL.Device.getNetworkInfo(callServerOnForeground);
    	}

    	function callServerOnForeground(networkInfo) {
    		if (networkInfo.isNetworkConnected === undefined || networkInfo.isNetworkConnected === null || networkInfo.isNetworkConnected) {
    			var isDirectUpdateSupported = WL.EnvProfile.isEnabled(WL.EPField.SUPPORT_DIRECT_UPDATE_FROM_SERVER);
    			new WLJSX.Ajax.WLRequest(REQ_PATH_COMPOSITE, {
    				method : 'post',
    				parameters : {
    					requests : JSON.stringify({
    						appversionaccess : {
    							reqPath : REQ_PATH_APP_VERSION_ACCESS,
    							parameters : {}
    						},
    						updates : {
    							reqPath : REQ_PATH_GET_APP_UPDATES,
    							parameters : {
    								skin : (isDirectUpdateSupported ? WL.Utils.getCurrentSkinName() : null),
    								skinLoaderChecksum : ((isDirectUpdateSupported && isAppHasSkinLoaderChecksum) ? WL.Utils.getSkinLoaderChecksum() : null)
    							}
    						}
    					})
    				},
    				onSuccess : onForegroundRequestCallback,
    				onFailure : onForegroundRequestFailure,
    				timeout : getAppProp(WL.AppProp.WLCLIENT_TIMEOUT_IN_MILLIS)
    			});
    		}
    	}

    	function onForegroundRequestCallback(transport) {    		
    		var response = transport.responseJSON;
    		var appVersionResponse = response.appversionaccess.response;

    		// handling application disabling and notifications
    		if (typeof appVersionResponse.messageType != "undefined") {
    			// We have some notification from the server
    			if (appVersionResponse.messageType == MESSAGE_TYPE_BLOCK) {
    				// the application shuold be blocked/
    				// convert it to be compatible prototype JSON response
    				blockApplication(appVersionResponse.message, appVersionResponse.downloadLink);
    				return;
    			} else if (appVersionResponse.messageType == MESSAGE_TYPE_NOTIFY) {
    				// Show notification only in case not shown already.
    				// If notification is shown, handleDirectUpdate() will be called from
    				// WL.SimpleDialog.show() callback
    				// (onForegroundRequestCallback). Else, we will call it directly
    				var lastNotification = __WL.LocalStorage.getValue(LAST_NOTIFICATION_KEY);
    				if (lastNotification != appVersionResponse.message) {
    					__WL.LocalStorage.setValue(LAST_NOTIFICATION_KEY, appVersionResponse.message);
    					WL.SimpleDialog.show(WL.ClientMessages.notificationTitle, appVersionResponse.message, [{
    						text : WL.ClientMessages.close,
    						handler : function() {
    							delete appVersionResponse.messageType;
    							onForegroundRequestCallback(transport);
    						}
    					}]);
    				} else {
    					handleDirectUpdate(response.updates.response, null);
    				}
    			}
    		} else {
    			// handling direct update
    			handleDirectUpdate(response.updates.response, null);
    		}
    	}

    	function onForegroundRequestFailure(transport) {
    		// empty implementation, the error is allready printed to the log via WLJSX.AJAX.Request object
    		// if callback wasn't defined an exception will be raised
    	}

    	function onInitFailure(transport) {
    		showWidgetContent();
    		onFailureResetSettings(transport);
    	}

    	function onAuthenticationFailure(transport) {
    		onAuthEnd();
    		onFailureResetSettings(transport);
    	}

    	function onFailureResetSettings(transport) {
    		isConnecting = false;
    		setConnected(false);
    		options.onFailure(new WL.FailResponse(transport));
    	}

    	function blockApplication(message, downloadLink) {
    		if (initOptions.onErrorAppVersionAccessDenial) {
    			hideBusy();
    			initOptions.onErrorAppVersionAccessDenial();
    			WL.App.close();
    		} else {
    			var buttons = [{
    				text : WL.ClientMessages.exitApplication,
    				handler : function() {
    					// Note you must add the null options to openURL otherwise the event is assumed the 3rd argument.
    					WL.App.close();
    				}
    			}];

    			if (downloadLink) {
    				buttons.push({
    					text : WL.ClientMessages.getNewVersion,
    					handler : function() {
    						// Note you must add the null options to openURL otherwise the event is assumed the 3rd argument.
    						WL.App.openURL(downloadLink, "_new", null);
    						WL.App.close();
    					}
    				});
    			}
    			// Patch - downloadNewVersion element is added in the msg string.
    			WL.SimpleDialog.show(WL.ClientMessages.applicationDenied, message, buttons);
    			hideBusy();
    		}
    	}

    	// for mobile environments, response from the server may conatin block/notify information
    	function processRuleMessage(transport) {
    		var response = transport.responseJSON;
    		var appVersionResponse = response.appversionaccess;
    		var message = appVersionResponse.message;
    		var downloadLink = appVersionResponse.downloadLink;
    		if (typeof appVersionResponse.messageType != "undefined") {
    			var messageType = appVersionResponse.messageType;
    			if (messageType == MESSAGE_TYPE_NOTIFY) {
    				// the sendInitRequest is in the callback because the dialog is async
    				WL.SimpleDialog.show(WL.ClientMessages.notificationTitle, message, [{
    					text : WL.ClientMessages.close,
    					handler : function (){onConnectSuccess(transport);}
    				}]);
    				if (getEnv() != WL.Env.BLACKBERRY) {
    					__WL.LocalStorage.setValue(LAST_NOTIFICATION_KEY, message);
    				}
    				canContinue = true;
    			} else if (messageType == MESSAGE_TYPE_BLOCK) {
    				blockApplication(message, downloadLink);
    			}
    		} else {
    			onConnectSuccess(transport);
    		}
    	}

    	function sendInitRequest() {
    		var isDirectUpdateSupported = WL.EnvProfile.isEnabled(WL.EPField.SUPPORT_DIRECT_UPDATE_FROM_SERVER);
    		new WLJSX.Ajax.WLRequest(REQ_PATH_INIT, {
    			parameters : {
    				skin : (isDirectUpdateSupported ? WL.Utils.getCurrentSkinName() : null),
    				skinLoaderChecksum : ((isDirectUpdateSupported && isAppHasSkinLoaderChecksum) ? WL.Utils.getSkinLoaderChecksum() : null)
    			},
    			onSuccess : processRuleMessage.bind(this),
    			onFailure : onInitFailure.bind(this),
    			timeout : timeout
    		});
    	}

    	isConnecting = true;
    	sendInitRequest();
    };

    /**
     * An asynchronous function. Logs in to a specific realm.
     * 
     * @param realm Optional. A realm that defines how the login process is performed. Specify NULL to log in
     *                to the resource realm assigned to the app when it was deployed. Note: To log in to
     *                Facebook, the realm must be a realm which uses a Facebook authenticator, and therefore
     *                its name must start with "facebook.".
     * @param options Optional. A standard options object.
     */
    this.login = function(realm, options) {
    	WL.Validators.validateArguments([WL.Validators.validateStringOrNull, WL.Validators.validateOptions.curry({
    		onSuccess : 'function',
    		onFailure : 'function',
    		timeout : 'number'
    	})], arguments, "WL.Client.login");

    	options = extendWithDefaultOptions(options);
    	login(realm, options);
    };

    /**
     * Invalidates the current session (via the server).
     * 
     * @param options, type: Options
     */
    this.logout = function(realm, options) {
    	WL.Validators.validateArguments([WL.Validators.validateStringOrNull, WL.Validators.validateOptions.curry({
    		onSuccess : 'function',
    		onFailure : 'function',
    		timeout : 'number'
    	})], arguments, 'WL.Client.logout');
    	options = extendWithDefaultOptions(options);

    	function onLogoutSuccess(transport) {
    		WL._InstanceId.value = null;
    		if (typeof userInfo[realm] == "undefined") {
    			onAuthStart();
    			return;
    		}
    		(userInfo[realm])[WL.UserInfo.IS_USER_AUTHENTICATED] = false;
    		if (getAppProp(WL.AppProp.LOGIN_REALM) === realm && heartBeatPeriodicalExecuter) {
    			// stop sending heart beats
    			heartBeatPeriodicalExecuter.stop();
    			heartBeatPeriodicalExecuter = null;
    		}
    		var logoutResponse = new WL.Response(transport, options.invocationContext);
    		logoutResponse.response = transport;
    		realm = realm || getAppProp(WL.AppProp.LOGIN_REALM);
    		if (getAppProp(WL.AppProp.LOGIN_REALM) === realm && isLoginOnStartup()) {
    			gadgetProps = {};
    			userInfo = {};
    			userPrefs = {};
    		}
    		options.onSuccess(logoutResponse);
    	}

    	function onLogoutFail(transport) {
    		if (WL.StaticAppProps.APP_LOGIN_TYPE == "onStartup") {
    			onAuthStart();
    		}
    		options.onFailure(new WL.FailResponse(transport, options.invocationContext));
    	}

    	realm = realm || getAppProp(WL.AppProp.LOGIN_REALM);
    	if (!realm) {
    		throw new Error("Invalid call for WL.Client.logout. Realm must be specified for unsecured applications.");
    	}

    	new WLJSX.Ajax.WLRequest(REQ_PATH_LOGOUT, {
    		parameters : {
    			realm : realm
    		},
    		onSuccess : onLogoutSuccess,
    		onFailure : onLogoutFail
    	});

    	if(!WLJSX.Ajax.WLRequest.setConnected){
    		WLJSX.Ajax.WLRequest.setConnected = function() {
    		};
    	}
    };

    /**
     * Returns a user pref value by its key or null if one is not defined.
     * @param prefKey, type string
     * 
     * @return user preference value, type: string or null
     */
    this.getUserPref = function(key) {
    	WL.Validators.validateArguments(['string'], arguments, 'WL.Client.getUserPref');
    	return userPrefs[key] || null;
    };

    /**
     * An asynchronous function. Creates a new user preference, or updates the value of an existing user
     * preference, as follows:
     * <ul>
     * <li>If a user preference with the specified user key is already defined, the user preference value is
     * updated.
     * <li>If there is no user preference defined with the specified key, a new user preference is created
     * with the specified key and value. However, if there are already 100 preferences, preference will be
     * created, and the method's failure handler will be called.
     * </ul>
     * 
     * @param key Mandatory. The user preference key.
     * @param value Mandatory. The value of the user preference.
     * @param options Optional. A standard {@link options} object.
     */
    this.setUserPref = function(key, value, options) {
    	WL.Validators.validateArguments(['string','string',WL.Validators.validateOptions.curry({
    		onSuccess : 'function',
    		onFailure : 'function'
    	})], arguments, 'WL.Client.setUserPref');
    	var userPrefsHash = {};
    	userPrefsHash[key] = value;
    	WL.Client.setUserPrefs(userPrefsHash, options);
    };

    /**
     * Updates the server with the current user prefs. Make sure you call this method after setting or
     * removing user prefs - otherwise the changes will be lost in the next session.
     * 
     * @param key, type string
     */
    this.setUserPrefs = function(userPrefsHash, options) {
    	WL.Validators.validateArguments(['object', WL.Validators.validateOptions.curry({
    		onSuccess : 'function',
    		onFailure : 'function',
    		invocationContext : function() {
    		}
    	})], arguments, 'WL.Client.setUserPrefs');

    	options = extendWithDefaultOptions(options);

    	function onStoreSuccess(transport) {
    		WLJSX.Object.extend(userPrefs, userPrefsHash);
    		options.onSuccess(new WL.Response(transport, options.invocationContext));
    	}
    	function onStoreFailure(transport) {
    		options.onFailure(new WL.FailResponse(transport, options.invocationContext));
    	}

    	// User is not allow to save key\value when value is 'undefined'.
    	// In case of 'undefined' we delete the key
    	for (var key in userPrefsHash){
    		if (typeof(userPrefsHash[key]) === 'undefined'){
    			WL.Logger.debug('WL.Client.setUserPrefs(): value for key:' + key + ' is \'undefined\', will save value as null');
    			userPrefsHash[key] = null;
    		}
    	}

    	var userPrefsJSON = WLJSX.Object.toJSON(userPrefsHash);
    	new WLJSX.Ajax.WLRequest(REQ_PATH_SET_USER_PREFS, {
    		parameters : {
    			userprefs : userPrefsJSON
    		},
    		onSuccess : onStoreSuccess,
    		onFailure : onStoreFailure,
    		timeout : getAppProp(WL.AppProp.WLCLIENT_TIMEOUT_IN_MILLIS)
    	});
    };

    this.deleteUserPref = function(key, options) {
    	WL.Validators.validateArguments(['string', WL.Validators.validateOptions.curry({
    		onSuccess : 'function',
    		onFailure : 'function'
    	})], arguments, 'WL.Client.deleteUserPref');

    	options = extendWithDefaultOptions(options);

    	function onDeleteSuccess(transport) {
    		delete userPrefs[key];
    		options.onSuccess(new WL.Response(transport, options.invocationContext));
    	}
    	function onDeleteFailure(transport) {
    		options.onFailure(new WL.FailResponse(transport, options.invocationContext));
    	}
    	new WLJSX.Ajax.WLRequest(REQ_PATH_DELETE_USER_PREF, {
    		parameters : {
    			userprefkey : key
    		},
    		onSuccess : onDeleteSuccess.bind(this),
    		onFailure : onDeleteFailure,
    		timeout : getAppProp(WL.AppProp.WLCLIENT_TIMEOUT_IN_MILLIS)
    	});
    };

    /**
     * Verifies if the user pref key exists.
     * @param key, type string
     * 
     * @return type boolean: true if exists.
     */
    this.hasUserPref = function(key) {
    	WL.Validators.validateArguments(['string'], arguments, 'WL.Client.hasUserPref');
    	return (key in userPrefs);
    };

    this.getAppProperty = function(propKey) {
    	WL.Validators.validateArguments(['string'], arguments, 'WL.Client.getAppProperty');
    	return getAppProp(propKey);
    };

    this.hasAppProperty = function(key) {
    	WL.Validators.validateArguments(['string'], arguments, 'WL.Client.hasAppProperty');
    	return (key in gadgetProps) || (key in WL.StaticAppProps);
    };

    this.getEnvironment = function() {
    	return getEnv();
    };

    /**
     * Used to report user activity for auditing or reporting purposes.
     * <p>
     * The Worklight server maintains a separate database table to store app statistics for each day of the
     * week. The tables are named gadget_stat_n, where n is a number from 1 to 7 which identifies the day of
     * the week. The method adds a user- specified log line to the relevant table.
     * 
     * @param activityType Mandatory. A string that identifies the activity.
     */
    this.logActivity = function(activityType) {
    	WL.Validators.validateArguments(['string'], arguments, 'WL.Client.logActivity');
    	function onMySuccess(transport) {
    		WL.Logger.debug("Activity [" + activityType + "] logged successfully.");
    	}
    	function onMyFailure(transport) {
    		WL.Logger.error("Activity [" + activityType + "] logging failed.");
    	}
    	new WLJSX.Ajax.WLRequest(REQ_PATH_LOG_ACTIVITY, {
    		parameters : {
    			activity : activityType
    		},
    		onSuccess : onMySuccess,
    		onFailure : onMyFailure,
    		timeout : getAppProp(WL.AppProp.WLCLIENT_TIMEOUT_IN_MILLIS)
    	});
    };

    /**
     * Updates the userInfo data with latest server information. The method was added as a workaround for
     * identifying backend authentication failures; After procedure failure, the application can activate and
     * the test the auth status using WL.Client.isUserAuthenticated(...)
     */
    this.updateUserInfo = function(options) {
    	WL.Validators.validateOptions({
    		onSuccess : 'function',
    		onFailure : 'function'
    	}, options, 'WL.Client.validateOptions');

    	options = extendWithDefaultOptions(options);

    	function onUpdateUserInfoSuccess(transport) {
    		WLJSX.Object.extend(userInfo, transport.responseJSON);
    		options.onSuccess(new WL.Response(transport, options.invocationContext));
    	}

    	function onUpdateUserInfoFailure(transport, msg) {
    		options.onFailure(new WL.FailResponse(transport, options.invocationContext));
    	}

    	new WLJSX.Ajax.WLRequest(REQ_PATH_GET_USER_INFO, {
    		onSuccess : onUpdateUserInfoSuccess,
    		onFailure : onUpdateUserInfoFailure,
    		timeout : getAppProp(WL.AppProp.WLCLIENT_TIMEOUT_IN_MILLIS)
    	});
    };

    this.getUserInfo = function(realm, key) {
    	WL.Validators.validateArguments([WL.Validators.validateStringOrNull, 'string'], arguments, 'WL.Client.getUserInfo');
    	return getUserInfoValue(key, realm);
    };

    /**
     * Returns the logged-in user name or NULL if unknown. The user identity can be know by the server but NOT
     * authenticated in case a Persistent Cookie is used. Use method isUserAuthenticated() to verify.
     */
    this.getUserName = function(realm) {
    	WL.Validators.validateStringOrNull(realm, 'WL.Client.getUserName');
    	return getUserInfoValue(WL.UserInfo.USER_NAME, realm);
    };

    /**
     * Returns the login name of the currently logged in user or NULL if unknown The loginName is used to by
     * the iPhone native application to inject the last logged in username when the gadget starts-up
     */
    this.getLoginName = function(realm) {
    	WL.Validators.validateStringOrNull(realm, 'WL.Client.getLoginName');
    	return getUserInfoValue(WL.UserInfo.LOGIN_NAME, realm);
    };

    /**
     * Returns TRUE if the user is authenticated to the given realm. If no realm is supplied will check the
     * gadget server realm.
     */
    this.isUserAuthenticated = function(realm) {
    	WL.Validators.validateStringOrNull(realm, 'WL.Client.isUserAuthenticated');
    	var isAuth = getUserInfoValue(WL.UserInfo.IS_USER_AUTHENTICATED, realm);

    	// userInfo properties are passed as strings.
    	return !!parseInt(isAuth || 0, 10);
    };

    /**
     * Invokes a procedure exposed by a Worklight adapter.
     * 
     * @param invocationData Mandatory. A JSON block of parameters. <br>
     *                <code>{<br>
     *            adapter : adapter-name.wlname,<br>
     *            procedure : adapter-name.procedure-name.wlname,<br>
     *            parameters : [],<br>
     *            }</code>
     * 
     * @param options Optional. Parameters hash.
     */
    this.invokeProcedure = function(invocationData, options) {

    	WL.Validators.validateOptions({
    		adapter : 'string',
    		procedure : 'string',
    		parameters : 'object'
    	}, invocationData, 'WL.Client.invokeProcedure');

    	WL.Validators.validateOptions({
    		onSuccess : 'function',
    		onFailure : 'function',
    		invocationContext : function() {
    		},
    		onConnectionFailure : 'function',
    		timeout : 'number'
    	}, options, 'WL.Client.invokeProcedure');

    	options = extendWithDefaultOptions(options);
    	function onInvokeProcedureSuccess(transport) {
    		if (!transport.responseJSON.isSuccessful) {
    			var failResponse = new WL.Response(transport, options.invocationContext);
    			failResponse.errorCode = WL.ErrorCode.PROCEDURE_ERROR;
    			failResponse.errorMsg = WL.ClientMessages.serverError;
    			failResponse.invocationResult = transport.responseJSON;
    			if (failResponse.invocationResult.errors) {
    				failResponse.errorMsg += " " + failResponse.invocationResult.errors;
    				WL.Logger.error(failResponse.errorMsg);
    			}
    			options.onFailure(failResponse);
    		} else {
    			var response = new WL.Response(transport, options.invocationContext);
    			response.invocationResult = transport.responseJSON;
    			options.onSuccess(response);
    		}
    	}

    	function onInvokeProcedureFailure(transport) {
    		setConnected(false);
    		var errorCode = transport.responseJSON.errorCode;
    		if (options.onConnectionFailure && (errorCode == WL.ErrorCode.UNRESPONSIVE_HOST || errorCode == WL.ErrorCode.REQUEST_TIMEOUT)) {
    			options.onConnectionFailure(new WL.FailResponse(transport, options.invocationContext));
    		} else {
    			options.onFailure(new WL.FailResponse(transport, options.invocationContext));
    		}
    	}

    	// Build request options from invocationData
    	var requestOptions = {
    		onSuccess : onInvokeProcedureSuccess,
    		onFailure : onInvokeProcedureFailure
    	};

    	if (!WLJSX.Object.isUndefined(options.timeout)) {
    		requestOptions.timeout = options.timeout;
    	}

    	requestOptions.parameters = {};
    	requestOptions.parameters.adapter = invocationData.adapter;
    	requestOptions.parameters.procedure = invocationData.procedure;
    	if (invocationData.parameters) {
    		requestOptions.parameters.parameters = WLJSX.Object.toJSON(invocationData.parameters);
    	}
    	new WLJSX.Ajax.WLRequest(REQ_PATH_BACKEND_QUERY, requestOptions);
    };

    /**
     * Fetchs an HTML or XML from a given URL (3rd party host). Applications should use to bypass the single
     * origin constraint of javascript XML. - The user must be authenticated before the app can use the
     * method. - The content is returned in the response.responseXML or response.responseText - Valid hosts
     * must be listed in conf/proxy_domains_whitelist.txt Each line in the file contains a single host name
     * example: www.cnn.com
     * 
     * @param url - a URL. Must start with http://
     * @param options (custom only): isXML - if true, responseXML is set with content, otherwise responseText.
     */
    this.makeRequest = function(url, options) {
    	WL.Validators.validateArguments(['string', WL.Validators.validateOptions.curry({
    		onSuccess : 'function',
    		onFailure : 'function',
    		timeout : 'number',
    		isXml : 'boolean'
    	})], arguments, 'WL.Client.makeRequest');

    	options = extendWithDefaultOptions(options);

    	function onFetchXMLSuccess(transport) {
    		var response = new WL.Response(transport, options.invocationContext);
    		response.responseXML = transport.responseXML;
    		options.onSuccess(response);
    	}

    	function onFetchTextSuccess(transport) {
    		var response = new WL.Response(transport, options.invocationContext);
    		response.responseText = transport.responseText;
    		options.onSuccess(response);
    	}

    	function onFetchFailure(transport) {
    		options.onFailure(new WL.FailResponse(transport, options.invocationContext));
    	}

    	var onSuccessCallback = options.isXml ? onFetchXMLSuccess : onFetchTextSuccess;
    	var myoptions = {
    		method : "get",
    		parameters : {
    			url : url
    		},
    		onSuccess : onSuccessCallback,
    		onFailure : onFetchFailure,
    		evalJSON : false
    	};
    	if ('timeout' in options) {
    		myoptions.timeout = options.timeout;
    	}
    	new WLJSX.Ajax.WLRequest(REQ_PATH_PROXY, myoptions);
    };

    this.close = function() {
    	if (getEnv() === WL.Env.ADOBE_AIR) {
    		air.NativeApplication.nativeApplication.icon.bitmaps = [];
    		var activeWindows = air.NativeApplication.nativeApplication.openedWindows;
    		for ( var i = 0; i < activeWindows.length; i++) {
    			activeWindows[i].close();
    		}
    		air.NativeApplication.nativeApplication.exit();
    		WL.Logger.debug("App closed");
    	}
    };

    this.minimize = function() {
    	if (getEnv() === WL.Env.ADOBE_AIR) {
    		var activeWindows = air.NativeApplication.nativeApplication.openedWindows;
    		for ( var i = 0; i < activeWindows.length; i++) {
    			if (getAppProp(WL.AppProp.SHOW_IN_TASKBAR)) {
    				activeWindows[i].minimize();
    			} else {
    				activeWindows[i].visible = false;
    			}
    		}
    		setMinimized(true);
    		WL.Logger.debug("App minimized");
    	}
    };

    this.restore = function() {
    	if (getEnv() === WL.Env.ADOBE_AIR) {
    		var activeWindows = air.NativeApplication.nativeApplication.openedWindows;
    		for ( var i = 0; i < activeWindows.length; i++) {
    			if (getAppProp(WL.AppProp.SHOW_IN_TASKBAR)) {
    				activeWindows[i].restore();
    			} else {
    				activeWindows[i].activate();
    			}
    		}
    		setMinimized(false);
    		WL.Logger.debug("App restored");
    	}
    };

    /**
     * Reloads the application.
     * <p>
     * Note: The Apple OS X Dashboard does not allow a app to automatically reload. Therefore, in this
     * environment, the reloadApp method displays a dialog box telling the user how to manually reload the
     * app.
     */
    this.reloadApp = function() {
    	switch (getEnv()) {
    		case WL.Env.OSX_DASHBOARD:
    			WL.SimpleDialog.show(WL.ClientMessages.osxReloadGadget, WL.ClientMessages.osxReloadGadgetInstructions, [{
    				text : "OK"
    			}]);
    			break;
    		default:
    			document.location.reload();
    		break;
    	}
    };

    /**
     * @deprecated Use WL.Device.getNetworkInfo(callbackFunction) to check connectivity. Look for
     *             isNetworkConnected in callbackFunction's network info parameter.
     */
    this.isConnected = function() {
    	return !!_isConnected;
    };

    this.setHeartBeatInterval = function(newIntervalInSecs) {
    	WL.Validators.validateArguments(['number'], arguments, 'WL.Client.setHeartBeatInterval');
    	initOptions.heartBeatIntervalInSecs = newIntervalInSecs;

    	if (heartBeatPeriodicalExecuter) {
    		heartBeatPeriodicalExecuter.stop();
    		heartBeatPeriodicalExecuter = null;
    	}

    	if (initOptions.heartBeatIntervalInSecs > 0) {
    		heartBeatPeriodicalExecuter = new WLJSX.PeriodicalExecuter(sendHeartBeat, initOptions.heartBeatIntervalInSecs);
    	}
    };
    
    /**
     * Initiate the function that handles onGetCustomDeviceProvisioningProperties (gets custom device provisiong data, to send to the server before starting the 
     * provisioinig process).
     * 
     * If the user addded his own implementation for onGetCustomDeviceProvisioningProperties, we call it, if not we call our own default.
     * The user should add his function using the WL.Client.init's options.
     */
    this.__getCustomDeviceProvisioningProperties = function(resumeDeviceProvisioningProcess) {
    	return initOptions.onGetCustomDeviceProvisioningProperties(resumeDeviceProvisioningProcess);
    };
    
    /**
     * Initiate the function that handles onGetCustomDeviceProperties (gets custom properties to send with the device auth payload)
     * If the user addded his own implementation for onGetCustomDeviceProperties, we call it, if not we call our own default.
     * The user adds his function using the WL.Client.init's options.
     */
    this.__getCustomDeviceProperties = function(resumeDeviceAuthProcess) {
    	return initOptions.onGetCustomDeviceProperties(resumeDeviceAuthProcess);
    };
};

__WL.prototype.Client = new __WLClient;
WL.Client = new __WLClient;
