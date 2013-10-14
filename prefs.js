/*
    Copyright (C) 2012, 2013  Philippe Normand.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

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

    let preferGajimHbox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL,
                                       margin_top: 5});

    let preferGajimLabel = new Gtk.Label({label: 'Clicking on the notification icon opens Gajim',
                                          xalign: 0 });

    let preferGajimOption = new Gtk.Switch({active: gsettings.get_boolean("prefer-native-gajim")});
    preferGajimOption.connect('notify::active', function(button) {
        gsettings.set_boolean("prefer-native-gajim", button.active);
    });

    let preferGajimHelp = "If you prefer to use Gajim itself to send messages you should toggle this option on.";
    preferGajimLabel.set_tooltip_text(preferGajimHelp);
    preferGajimOption.set_tooltip_text(preferGajimHelp);

    preferGajimHbox.pack_start(preferGajimLabel, true, true, 0);
    preferGajimHbox.add(preferGajimOption);
    vbox.add(preferGajimHbox);

    frame.add(vbox);
    frame.show_all();
    return frame;
}
