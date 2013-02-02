const Gtk = imports.gi.Gtk;

const Utils = imports.misc.extensionUtils.getCurrentExtension().imports.utils;

let gsettings;

function init() {
    gsettings = Utils.getSettings();
}

function buildPrefsWidget() {
    let frame = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL,
                             border_width: 10 });
    let vbox = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL,
                            margin: 20, margin_top: 10 });

    let hbox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL,
                            margin_top: 5});

    let label = new Gtk.Label({label: 'Use a new Chat source to initiate a chat from search results',
                               xalign: 0 });

    let option = new Gtk.Switch({active: gsettings.get_boolean("chat-initiator")});
    option.connect('notify::active', function(button) {
        gsettings.set_boolean("chat-initiator", button.active);
    });

    let help = "Disabling this option means the native Gajim UI will be used to initiate chats from search results";
    label.set_tooltip_text(help);
    option.set_tooltip_text(help);

    hbox.pack_start(label, true, true, 0);
    hbox.add(option);
    vbox.add(hbox);

    frame.add(vbox);
    frame.show_all();
    return frame;
}
