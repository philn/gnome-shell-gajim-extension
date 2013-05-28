/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Signals = imports.signals;
const St = imports.gi.St;
const Tp = imports.gi.TelepathyGLib;

const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const MessageTray = imports.ui.messageTray;
const Search = imports.ui.search;
const Shell = imports.gi.Shell;
const TelepathyClient = imports.ui.components.telepathyClient;

const PopupMenu = imports.ui.popupMenu;
const NotificationDaemon = imports.ui.notificationDaemon;
const Utils = imports.misc.extensionUtils.getCurrentExtension().imports.utils;

const settings = Utils.getSettings();

function wrappedText(text, sender, senderAlias, timestamp, direction) {
    if (!timestamp)
        timestamp = (Date.now()  / 1000);
    let type;
    if (text.slice(0, 4) == '/me ') {
        type = Tp.ChannelTextMessageType.ACTION;
        text = text.slice(4);
        sender = senderAlias;
    } else {
        type = Tp.ChannelTextMessageType.NORMAL;
    }
    return {
        messageType: type,
        text: text,
        sender: sender,
        timestamp: timestamp,
        direction: direction
    };
}

const Source = new Lang.Class({
    Name: 'Source',
    Extends: MessageTray.Source,

    getSecondaryIcon: function() {
        let iconName;
        let presenceType = this._presence;

        switch (presenceType) {
            case Tp.ConnectionPresenceType.AVAILABLE:
                iconName = 'user-available';
                break;
            case Tp.ConnectionPresenceType.BUSY:
                iconName = 'user-busy';
                break;
            case Tp.ConnectionPresenceType.OFFLINE:
                iconName = 'user-offline';
                break;
            case Tp.ConnectionPresenceType.HIDDEN:
                iconName = 'user-invisible';
                break;
            case Tp.ConnectionPresenceType.AWAY:
                iconName = 'user-away';
                break;
            case Tp.ConnectionPresenceType.EXTENDED_AWAY:
                iconName = 'user-idle';
                break;
            default:
                iconName = 'user-offline';
       }
       return new Gio.ThemedIcon({ name: iconName });
    },

    _init: function(gajimExtension, accountName, author, initialMessage) {
        this.parent(accountName, null, null, author);
        this.isChat = true;
        this._pendingMessagesCount = 0;

        this._author = author;
        this._gajimExtension = gajimExtension;
        this._accountName = accountName;
        this._initialMessage = initialMessage;

        // These are set from various DBus calls results.
        this._presence = "online";
        this._avatarUri = null;
        this._myJid = null;
        this._myFullName = null;

        this._notification = new TelepathyClient.ChatNotification(this);
        this._notification.setUrgency(MessageTray.Urgency.HIGH);
        this._notification.connect('expanded', Lang.bind(this, this._flushPendingMessages));
        this._notification.connect('clicked', Lang.bind(this, this._flushPendingMessages));
        this.connect('summary-item-clicked', Lang.bind(this, this._flushPendingMessages));
        this._notifyTimeoutId = 0;

        let proxy = this._gajimExtension.proxy();
        if (proxy) {
            proxy.list_contactsRemote(accountName, Lang.bind(this,
				function(result, excp) {
					for (let contact in result[1])
						contact = contact.deep_unpack();
						
					this._gotContactList(result, excp);
				}));
            
            proxy.contact_infoRemote(this._accountName, Lang.bind(this,
				function([result], excp) {
					
					for (let param in result)
						result[param] = result[param].deep_unpack();
						
					this._gotAccountInfo(result, excp);
				}));
            
            
            this._statusChangeId = proxy.connectSignal('ContactStatus',	Lang.bind(this,
				function(emitter, name, [data]) {
					
					var status 	 = [new Array(2),new Array(2)];
					status[1][0] = data[1].get_child_value(0).get_variant().deep_unpack();
					status[1][1] = data[1].get_child_value(1).get_variant().deep_unpack();
					
					this._onStatusChange(emitter, status);
				}));
			
            this._contactAbsenceId = proxy.connectSignal('ContactAbsence', Lang.bind(this,
				function(emitter, name, [data]) {
					
					var status 	 = [new Array(2),new Array(2)];
					status[1][0] = data[1].get_child_value(0).get_variant().deep_unpack();
					status[1][1] = data[1].get_child_value(1).get_variant().deep_unpack();
					
					this._onStatusChange(emitter, data);
				}));
			
            this._chatStateId = proxy.connectSignal('ChatState', Lang.bind(this,
				function(emitter, name, [data]) {

					var ndata = [new Array(6),new Array(6)];
					ndata[1][5] = data[1].get_child_value(5).get_variant().deep_unpack();
				
					this._onChatState(emitter, ndata);
				}));
			
            this._messageSentId = proxy.connectSignal('MessageSent', Lang.bind(this,
 				function(emitter, name, [data]) {
					
					var ndata = [new Array(4),new Array(4)];
					ndata[1][0] = data[1].get_child_value(0).get_variant().deep_unpack();
					ndata[1][1] = data[1].get_child_value(1).get_variant().deep_unpack();
					ndata[1][3] = data[1].get_child_value(3).get_variant().deep_unpack();

					this._messageSent(emitter, ndata);
				}));
        }

        Main.messageTray.add(this);
        this.pushNotification(this._notification);

        //this._getLogMessages();
    },
    
    buildRightClickMenu: function() {
        let item;

        let rightClickMenu = this.parent();
        item = new PopupMenu.PopupMenuItem('');
        item.actor.connect('notify::mapped', Lang.bind(this, function() {
            item.label.set_text(this.isMuted ? _("Unmute") : _("Mute"));
        }));
        item.connect('activate', Lang.bind(this, function() {
            this.setMuted(!this.isMuted);
            this.emit('done-displaying-content', false);
        }));
        rightClickMenu.add(item.actor);
        return rightClickMenu;
    },
    
     _createPolicy: function() {
        return new NotificationDaemon.NotificationApplicationPolicy('empathy');
    },
       
    destroy: function() {
        let proxy = this._gajimExtension.proxy();
        if (proxy) {
            proxy.disconnect(this._statusChangeId);
            proxy.disconnect(this._contactAbsenceId);
            proxy.disconnect(this._chatStateId);
            proxy.disconnect(this._messageSentId);
        }
        this.parent();
    },

    _gotAccountInfo: function(result, excp) {
        this._myJid = result['jid'];
        let proxy = this._gajimExtension.proxy();
		if (proxy && this._myJid) {
			proxy.contact_infoRemote(this._myJid.toString(), Lang.bind(this,
				function([result], excp) {
					
					for (let param in result)
						result[param] = result[param].deep_unpack();
					
					this._gotMyContactInfos(result, excp);
				}));
		}
    },

    _gotMyContactInfos: function(result, excp) {
        this._myFullName = result['FN'] || result['NICKNAME'] || result['jid'];
    },

    _gotContactList: function(result, excp) {
        for (let i = 0; i < result.length; i++) {
            let contact = result[i];
            if (contact['jid'] == this._author) {
                this._presence = contact['show'];
                break;
            }
        }

        let proxy = this._gajimExtension.proxy();
        if (proxy) {
            proxy.contact_infoRemote(this._author, Lang.bind(this,
				function([result], excp) {
					
					for (let param in result)
						result[param] = result[param].deep_unpack();
					
					result['PHOTO']['BINVAL'] 	= result['PHOTO']['BINVAL'].deep_unpack();
					result['PHOTO']['TYPE'] 	= result['PHOTO']['TYPE'].deep_unpack();
					result['PHOTO']['SHA']		= result['PHOTO']['SHA'].deep_unpack();
					
					this._gotContactInfos(result, excp);
				}));
		}
    },

    _gotContactInfos: function(result, excp) {

        this.title = result['FN'] || result['NICKNAME'] || result['jid'];
        
        let avatarUri = null;
        if (result['PHOTO']) {
            let mimeType = result['PHOTO']['TYPE'];
            let avatarData = GLib.base64_decode(result['PHOTO']['BINVAL']);
            let sha = result['PHOTO']['SHA'];
            avatarUri = this._gajimExtension.cacheAvatar(mimeType, sha, avatarData);
        }

        this._avatarUri = avatarUri;
        
                
        this.iconUpdated();
        this._notification.update(this._notification.title, null,
                                  { customContent: true,
                                    secondaryGIcon: this.createSecondaryIcon() });

        let message = wrappedText(this._initialMessage, this._author, this.title, null, TelepathyClient.NotificationDirection.RECEIVED);
        this._appendMessage(message, false);

        this.notify();
    },

    createIcon: function(size) {
        this._iconBox = new St.Bin({ style_class: 'avatar-box' });
        this._iconBox._size = size;

        if (this._avatarUri) {
            let textureCache = St.TextureCache.get_default();
            this._iconBox.child = textureCache.load_uri_async(this._avatarUri, this._iconBox._size, this._iconBox._size);
        } else
            this._iconBox.child = new St.Icon({ icon_name: 'avatar-default'});
        return this._iconBox;
    },

    createSecondaryIcon: function() {
        let iconName;

        switch (this._presence) {
            case "away":
                iconName = 'user-away';
                break;
            case  "offline":
                iconName = 'user-offline';
                break;
            case "online":
                iconName = 'user-available';
                break;
            case "dnd":
                iconName = 'user-busy';
                break;
            default:
                iconName = 'user-offline';
        }

       return new Gio.ThemedIcon({ name: iconName });
    },

    handleSummaryClick: function() {
        if (settings.get_boolean("prefer-native-gajim")) {
            this.open(null);
            return true;
        }
        return false;
    },

    open: function(notification) {
        // Lookup for the messages window and display it. In the case where it's not o
        // opened yet fallback to the roster window.
        let windows = global.get_window_actors();
        for (let i = 0; i < windows.length; i++) {
            let metaWindow = windows[i].metaWindow;
            let role = metaWindow.get_role();
            if (metaWindow.get_wm_class_instance() == "gajim" &&
                (["messages", "roster"].indexOf(role) != -1)) {
                Main.activateWindow(metaWindow);
                return;
            }
        }

        let app = Shell.AppSystem.get_default().lookup_app('gajim.desktop');
        app.activate(-1);
    },

    _onChatState: function(emitter, data) {
        let chatstate = data[1][5];
        if (chatstate == 'gone')
            this.destroy();
    },

    _flushPendingMessages: function() {
        this._pendingMessagesCount = 0;
        this.countUpdated();
    },
    
    get count() {
        return this._pendingMessagesCount;
    },

    get unseenCount() {
        return this.count;
    },

    get countVisible() {
        return this.count > 0;
    },

    _appendMessage: function(message, noTimestamp) {
        if (!this._notification.expanded) {
            this._pendingMessagesCount++;
            this.countUpdated();
        }
        this._notification.appendMessage(message, noTimestamp);
    },

    handleMessageReceived: function(text) {
        let message = wrappedText(text, this._author, this.title, null, TelepathyClient.NotificationDirection.RECEIVED);
        this._appendMessage(message, true);

        // Wait a bit before notifying for the received message, a handler
        // could ack it in the meantime.
        if (this._notifyTimeoutId != 0)
            Mainloop.source_remove(this._notifyTimeoutId);
        this._notifyTimeoutId = Mainloop.timeout_add(500,
            Lang.bind(this, this._notifyTimeout));
    },

    _notifyTimeout: function() {
        this.notify();
        this._notifyTimeoutId = 0;
        return false;
    },

    _messageSent: function(emitter, data) {
        let recipient = data[1][0];
        let text = data[1][1];
        let chatstate = data[1][3];
        
        if (text && (recipient == this._author)) {
            let message = wrappedText(text, this._myJid, this._myFullName, null, TelepathyClient.NotificationDirection.SENT);
            this._appendMessage(message, false);
        } else if (chatstate == 'gone')
            this.destroy();
    },

    notify: function() {
        this.parent(this._notification);
    },

    respond: function(text) {
        let jid = this._author;
        let keyID = ""; // unencrypted.
        
        let proxy = this._gajimExtension.proxy();
        if (proxy)
            proxy.send_chat_messageRemote(jid, text, keyID, this._accountName);
    },

    setChatState: function(state) {
        // Gajim DBUS API doesn't support sending chatstate yet.
    },

    _onStatusChange: function(emitter, data) {
        if (!this.title)
            return;

        let jid = data[1][0];
        let presence = data[1][1];

        if (jid != this._author)
            return;

        this._presence = presence;
        this._notification.update(this._notification.title, null,
                                  { customContent: true,
                                    secondaryGIcon: this.createSecondaryIcon() });
    }
});


const GajimSearchProvider = new Lang.Class({
    Name: 'GajimSearchProvider',
    Extends: Search.SearchProvider,

    _init: function (gajimExtension) {
        this.parent('GAJIM CONTACTS');
        this._gajimExtension = gajimExtension;
        this._accounts = [];
        let proxy = this._gajimExtension.proxy();
        if (proxy) {
            proxy.list_accountsRemote(Lang.bind(this, this._gotAccountsList));
            this._subscribedId = proxy.connect('Subscribed',
                                               Lang.bind(this, this._onSubscribed));
            this._unsubscribedId = proxy.connect('Unsubscribed',
                                                 Lang.bind(this, this._onUnsubscribed));
        }
    },

    destroy: function() {
        let proxy = this._gajimExtension.proxy();
        if (proxy) {
            proxy.disconnect(this._subscribedId);
            proxy.disconnect(this._unsubscribedId);
        }
        this.parent();
    },

    _gotAccountsList: function(result, excp) {
        let proxy = this._gajimExtension.proxy();
        for (let i = 0; i < result.length; i++) {
            let accountName = result[i];
            if (proxy)
                proxy.list_contactsRemote(accountName, Lang.bind(this, function(r, e) {
                                                                     this._gotContactList(accountName, r, e);
                                                                 }));

        }
    },

    _onSubscribed: function(emitter, data) {
        let accountName = data[0];
        let jid = data[1][0];
        if (accountName in this._accounts)
            delete this._accounts[accountName];

        let proxy = this._gajimExtension.proxy();
        if (proxy)
            proxy.list_contactsRemote(accountName, Lang.bind(this, function(r, e) {
                                                                 this._gotContactList(accountName, r, e);
                                                             }));
    },

    _onUnsubscribed: function(emitter, data) {
        let accountName = data[0];
        let jid = data[1][0];
        if (accountName in this._accounts) {
            let account = this._accounts[accountName];
            for (let i = 0; i < account["contacts"].length; i++) {
                let contact = account["contacts"][i];
                if (contact["jid"] == jid) {
                    account["contacts"].splice(i, 1);
                    return;
                }
            }
        }
    },

    _gotContactList: function(accountName, result, excp) {
        let account = {
            name: accountName,
            contacts: result
        };
        this._accounts.push(account);
    },

    _gotContactInfos: function(contact, result, excp) {
        if (result['PHOTO']) {
            let avatarUri = null;
            let mimeType = result['PHOTO']['TYPE'];
            let avatarData = GLib.base64_decode(result['PHOTO']['BINVAL']);
            let sha = result['PHOTO']['SHA'];
            avatarUri = this._gajimExtension.cacheAvatar(mimeType, sha, avatarData);
            contact.avatarUri = avatarUri;
        }
    },

    _getResultSet: function (accounts, terms) {
        let results = [];
        for (let i = 0; i < accounts.length; i++) {
            let account = accounts[i];
            for (let j = 0; j < account["contacts"].length; j++) {
                let contact = account["contacts"][j];
                for (let t = 0; t < terms.length; t++) {
                    if ((contact["jid"].toLowerCase().indexOf(terms[t]) != -1)
                        || (contact["name"].toLowerCase().indexOf(terms[t]) != -1)) {
                        let proxy = this._gajimExtension.proxy();
                        if (proxy) {
                            proxy.contact_infoRemote(contact["jid"],
                                                     Lang.bind(this,
                                                               function (r, e) {
                                                                   this._gotContactInfos(contact, r, e);
                                                               }));
                            contact["account"] = account["name"];
                            results.push(contact);
                        }
                    }
                }
            }
        }

        this.searchSystem.pushResults(this, results);
    },

    getInitialResultSet: function(terms) {
        return this._getResultSet(this._accounts, terms);
    },

    getSubsearchResultSet: function(previousResults, newTerms) {
        return this._getResultSet(this._accounts, newTerms);
    },

    _createIconForId: function (id, size) {
        let box = new Clutter.Box();
        let textureCache = St.TextureCache.get_default();
        if (id.avatarUri)
            box.add_child(textureCache.load_uri_async(id.avatarUri, size, size));
        else {
            let icon = textureCache.load_icon_name(null, 'gajim',
                                                   St.IconType ? St.IconType.FULLCOLOR : size,
                                                   size);
            box.add_child(icon);
        }
        return box;
    },

    getResultMeta: function (id) {
        return { id: id,
                 name: id.name + ' (' + id.jid + ')',
                 createIcon: Lang.bind(this, function (size) {
                     return this._createIconForId(id, size);
                 })
               };
    },

    getResultMetas: function(ids, callback) {
        let metas = ids.map(this.getResultMeta, this);
        callback(metas);
    },

    activateResult: function(id) {
        this._gajimExtension.initiateChat(id.account, id.jid);
    }
});

const GajimIface = <interface name="org.gajim.dbus.RemoteInterface">
<method name="send_chat_message">
	<arg type="s" direction="in" />
	<arg type="s" direction="in" />
	<arg type="s" direction="in" />
	<arg type="s" direction="in" />
	<arg type="b" direction="out" />
</method>
<method name="contact_info">
	<arg type="s" direction="in" />
	<arg type="a{sv}" direction="out" />
</method>
<method name="account_info">
	<arg type="s" direction="in" />
	<arg type="a{ss}" direction="out" />
</method>
<method name="list_contacts">
	<arg type="s" direction="in" />
	<arg type="aa{sv}" direction="out" />
</method>
<method name="list_accounts">
	<arg type="as" direction="out" />
</method>
<method name="open_chat">
	<arg type="s" direction="in" />
	<arg type="s" direction="in" />
	<arg type="s" direction="in" />
	<arg type="b" direction="out" />
</method>
<signal name="NewMessage">
	<arg type="av" direction="out" />
</signal>
<signal name="ChatState">
	<arg type="av" direction="out" />
</signal>
<signal name="ContactStatus">
	<arg type="av" direction="out" />
</signal>
<signal name="ContactAbsence">
	<arg type="av" direction="out" />
</signal>
<signal name="MessageSent">
	<arg type="av" direction="out" />
</signal>
<signal name="Subscribed">
	<arg type="av" direction="out" />
</signal>
<signal name="Unsubscribed">
	<arg type="av" direction="out" />
</signal>
</interface>;

let Gajim = Gio.DBusProxy.makeProxyWrapper(GajimIface);

const GajimExtension = new Lang.Class({
    Name: 'GajimExtension',

    _init: function() {
        this._sources = {};
        this._proxy = null;
        this._provider = null;
    },

    proxy : function() {
        return this._proxy;
    },

    enable: function() {
        this._cacheDir = GLib.get_user_cache_dir() + '/gnome-shell/gajim-avatars';
        let dir = Gio.file_new_for_path(this._cacheDir);
        if (!dir.query_exists(null)) {
            GLib.mkdir_with_parents(this._cacheDir, 0x1c0); // 0x1c0 = octal 0700
        }

        this._proxy = new Gajim(Gio.DBus.session, 'org.gajim.dbus', '/org/gajim/dbus/RemoteObject');

		this._newMessageId = this._proxy.connectSignal('NewMessage', Lang.bind(this,
			function(proxy, sender, [status]) {
				
				this._messageReceived(null,
							status[1].get_child_value(0).get_variant().deep_unpack(),
							status[1].get_child_value(1).get_variant().deep_unpack(),
							status[0].deep_unpack());
			}));
			
		if (!this._provider) {
			this._provider = new GajimSearchProvider(this);
			Main.overview.addSearchProvider(this._provider);
		}
    },

    disable: function() {
        if (this._provider) {
            Main.overview.removeSearchProvider(this._provider);
            this._provider = null;
        }

        if (this._newMessageId) {
            this._proxy.disconnect(this._newMessageId);
            this._newMessageId = 0;
        }
        this._proxy = null;

        for (let id in this._sources)
            this._sources[id].destroy();

        this._sources = { };
    },

    _messageReceived : function(emitter, author, message, account) {
        
		author	= author.toString().split('/')[0];

        let source = this._sources[author];

        if (!source) {
            source = new Source(this, account, author, message);
            source.connect('destroy', Lang.bind(this,
                function() {
                    delete this._sources[author];
                }));
            this._sources[author] = source;
        } else {
            source.handleMessageReceived(message);
		}
    },

    initiateChat : function(account, recipient) {
        if (settings.get_boolean("chat-initiator")) {
            let source = new Source(this, account, recipient, "");
            source.connect('destroy', Lang.bind(this,
                                                function() {
                                                    delete this._sources[recipient];
                                                }));
            this._sources[recipient] = source;
        } else if (this._proxy) {
            this._proxy.open_chatRemote(recipient, account, "");
        }
    },

    cacheAvatar : function(mimeType, sha, avatarData) {
		
        let ext = mimeType.split('/')[1];
        let file = this._cacheDir + '/' + sha + '.' + ext;
        let uri = GLib.filename_to_uri(file, null);

        if (GLib.file_test(file, GLib.FileTest.EXISTS))
            return uri;

        let success = false;
        try {
            success = GLib.file_set_contents(file, avatarData, avatarData.length);
        } catch (e) {
            logError(e, 'Error caching avatar data');
        }
        return uri;
    }

});

function init() {
    return new GajimExtension();
}
