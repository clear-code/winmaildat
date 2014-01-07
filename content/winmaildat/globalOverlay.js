/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is "Winmail Opener Bridge".
 *
 * The Initial Developer of the Original Code is ClearCode Inc.
 * Portions created by the Initial Developer are Copyright (C) 2010-2013
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s): ClearCode Inc. <info@clear-code.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var WinmailOpenerBridge = {
	init : function()
	{
		window.removeEventListener('DOMContentLoaded', this, false);

		// Thunderbird 3
		if ('openAttachment' in window) {
			eval('window.openAttachment = '+
				window.openAttachment.toSource().replace(
					'{',
					'$&\n' +
					'  if (window.WinmailOpenerBridge.handleAttachment(aAttachment))\n' +
					'    return;\n'
				)
			);
		}

		// Thunderbird 10
		if ('AttachmentInfo' in window &&
			AttachmentInfo.prototype.open) {
			eval('AttachmentInfo.prototype.open = '+
				AttachmentInfo.prototype.open.toSource().replace(
					'{',
					'$&\n' +
					'  if (this.hasFile && window.WinmailOpenerBridge.handleAttachment(this))\n' +
					'    return;\n'
				)
			);
		}

		window.addEventListener('unload', this, false);
	},

	destroy : function()
	{
		window.removeEventListener('unload', this, false);
		this.tempFiles.forEach(function(aFile) {
			try {
				aFile.remove(true);
			}
			catch(e) {
			}
		});
	},

	handleAttachment : function(aAttachment) {
		var fileName = aAttachment.displayName || aAttachment.name;
		if (fileName.toLowerCase() != 'winmail.dat')
			return false;

		if (aAttachment.isExternalAttachment ||
			/^file:\/\//.test(aAttachment.url)) {
			try {
				var file = this.fileHandler.getFileFromURLSpec(aAttachment.url);
				this.open(file);
				return true;
			}
			catch(e) {
				Components.utils.reportError(e);
			}
		}
		else {
			try {
				var dest = this.getTempFolder();

				// 同名のファイルがある場合は先に削除する
				var temp = dest.clone();
				temp.append(fileName);
				// tempのexists()が、ファイルが存在していても何故かfalseを返す事がある。
				// その場合、同じパスで作った別のファイルハンドラだと正しい結果が返ってくる。
				temp = this.getFileWithPath(temp.path);
				if (temp.exists()) {
					var index = this.tempFiles.indexOf(temp);
					if (index > -1) this.tempFiles.splice(index, 1);
					temp.remove(true);
				}

				dest = messenger.saveAttachmentToFolder(
					aAttachment.contentType,
					aAttachment.url,
					encodeURIComponent(fileName),
					aAttachment.uri,
					dest
				);
				var delay = 200;
				var count = 0;
				window.setTimeout(function(aSelf) {
					if (dest.exists()) {
						aSelf.tempFiles.push(dest);
						aSelf.open(dest);
					}
					else if (++count < 50) {
						window.setTimeout(arguments.callee, delay, aSelf);
					}
				}, delay, this);
				return true;
			}
			catch(e) {
				Components.utils.reportError(e);
			}
		}
		return false;
	},

	open : function(aFile)
	{
		var exe = this.registry.getValue(this.prefs.getPref('extensions.winmaildat@clear-code.com.opener.key'));
		try {
			if (exe)
				exe = this.getFileWithPath(exe);
		}
		catch(e) {
			Components.utils.reportError(e);
		}

		if (!exe) {
			exe = this.prefs.getPref('extensions.winmaildat@clear-code.com.opener.path');
			try {
				if (exe)
					exe = this.getFileWithPath(exe);
			}
			catch(e) {
				Components.utils.reportError(e);
			}
		}

		if (!exe) {
			window.alert(this.bundle.getString('error_notfound'));
			return;
		}

		var args = this.prefs.getPref('extensions.winmaildat@clear-code.com.opener.args')
					.split(/[ \t]+/)
					.map(function(aArg) {
						return aArg.replace(/\%S/g, aFile.path);
					});
		var process = Components.classes['@mozilla.org/process/util;1']
						.createInstance(Components.interfaces.nsIProcess);
		process.init(exe);
		process.run(false, args, args.length, {});
	},

	get registry()
	{
		delete this.registry;
		var ns = {};
		Components.utils.import('resource://winmaildat-modules/registry.jsm', ns);
		return this.registry = ns.registry;
	},

	get prefs()
	{
		delete this.prefs;
		var ns = {};
		Components.utils.import('resource://winmaildat-modules/prefs.js', ns);
		return this.prefs = ns.prefs;
	},

	get bundle()
	{
		delete this.bundle;
		var ns = {};
		Components.utils.import('resource://winmaildat-modules/stringBundle.js', ns);
		return this.bundle = ns.stringBundle.get('chrome://winmaildat/locale/winmaildat.properties');
	},

	mIOService : Components.classes['@mozilla.org/network/io-service;1']
		.getService(Components.interfaces.nsIIOService),

	mDirectoryService : Components.classes['@mozilla.org/file/directory_service;1']
		.getService(Components.interfaces.nsIProperties),

	get fileHandler()
	{
		delete this.fileHandler;
		return this.fileHandler = this.mIOService
									.getProtocolHandler('file')
									.QueryInterface(Components.interfaces.nsIFileProtocolHandler);
	},

	getTempFolder : function()
	{
		return this.mDirectoryService.get('TmpD', Components.interfaces.nsIFile)
					.QueryInterface(Components.interfaces.nsILocalFile);
	},

	getFileWithPath : function(aPath)
	{
		var file = Components.classes['@mozilla.org/file/local;1']
					.createInstance(Components.interfaces.nsILocalFile);
		file.initWithPath(aPath);
		return file;
	},

	tempFiles : [],

	handleEvent : function(aEvent)
	{
		switch (aEvent.type)
		{
			case 'DOMContentLoaded':
				return this.init();

			case 'unload':
				return this.destroy();
		}
	}
};
