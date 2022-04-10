/**
 * @class monetary.gift
 * @static
 *
 * Gift money module handles giving out created gift codes to members.
 */

money.gift = (function(){

	return {

		/**
		 * @property {Object} settings Default settings which can be overwritten from setup.
		 * @property {Boolean} settings.enabled Module enabled or not.
		 * @property {Number} settings.paid_into Where the money is going to be paid into.
		 * @property {Array} codes Active codes that are create in the plugin settings.
		 */

		settings: {

			enabled: true,
			paid_into: 0,
			codes: []

		},

		/**
		 * @property {Object} lookup All gift objects go ito this object for quick lookup.
		 */

		lookup: {},

		/**
		 * @property {Array} array_lookup All unique gift code strings are pushed into this lookup array.
		 */

		array_lookup: [],

		/**
		 * @property {String} current_code The current gift code the user is trying to access.
		 */

		current_code:  "",

		/**
		 * This is called from the main class.  Each module gets registered and a loop goes through and calls this.
		 */

		init: function(){

			// Basic checking so we don't need to run setup on each page

			if(yootil.user.logged_in() && money.can_earn_money){
				this.setup();

				if(!this.settings.enabled){
					money.show_default();
					return;
				}

				this.add_to_yootil_bar();

				if(location.href.match(/\?monetarygift=(.+?)?$/i)){
					var unsafe_code = decodeURIComponent(RegExp.$1);

					yootil.create.nav_branch(yootil.html_encode(location.href), "Gift Money");
					yootil.create.page("?monetarygift", "Gift Money");

					if(!this.gift_money()){
						var code_msg = "";

						if(unsafe_code && unsafe_code.length){
							code_msg = " quoting the code \"<strong>" + yootil.html_encode(unsafe_code) + "</strong>\"";
						}

						this.show_error("<p>The gift code you are trying to access either isn't for you, doesn't exist, or you have already accepted.</p><p>If you think this is an error, please contact a member of staff" + code_msg + ".</p>");
					}
				}
			}
		},

		/**
		 * Handles overwriting default values.  These come from the plugin settings.
		 * Also populates the lookup object and array.
		 */

		setup: function(){
			if(money.plugin){
				var settings = money.plugin.settings;

				this.settings.enabled = (!! ~~ settings.free_money_enabled)? true : false;
				this.settings.paid_into = (!! ~~ settings.free_money_paid_into)? 1 : 0;
				this.settings.codes = (settings.free_money_codes && settings.free_money_codes.length)? settings.free_money_codes : [];

				if(!money.bank.settings.enabled){
					this.settings.paid_into = 0;
				}

				if(settings.gift_money_image && settings.gift_money_image.length){
					money.images.giftmoney = settings.gift_money_image;
				}

				if(settings.gift_money_image_small && settings.gift_money_image_small.length){
					money.images.giftmoneysmall = settings.gift_money_image_small;
				}

				for(var c = 0, l = this.settings.codes.length; c < l; c ++){
					this.lookup[this.settings.codes[c].unique_code.toLowerCase()] = {
						code: this.settings.codes[c].unique_code.toLowerCase(),
						amount: this.settings.codes[c].amount,
						message: this.settings.codes[c].message,
						members: this.settings.codes[c].members,
						groups: this.settings.codes[c].groups,
						show_icon: (this.settings.codes[c].show_gift_icon && this.settings.codes[c].show_gift_icon == "0")? false : true
					};

					this.array_lookup.push(this.settings.codes[c].unique_code.toLowerCase());
				}
			}
		},

		/**
		 * Registers this module to the money class.
		 * @returns {Object}
		 */

		register: function(){
			money.modules.push(this);
			return this;
		},

		/**
		 * Adds gift icon to the yootil bar if the icon is enabled.
		 */

		add_to_yootil_bar: function(){
			for(var key in this.lookup){
				if(this.lookup[key].show_icon){
					if(!this.has_received(key) && this.allowed_gift(this.lookup[key])){
						yootil.bar.add("/?monetarygift=" + key, money.images.giftmoneysmall, "Gift Money", "gift_" + key);
					}
				}
			}
		},

		/**
		 * Creates an error container and shows the message to the user.
		 *
		 * @param {String} msg The message to show.
		 */

		show_error: function(msg){
			var html = "";

			html += "<div class='monetary-gift-notice-icon'><img src='" + money.images.giftmoney + "' /></div>";
			html += "<div class='monetary-gift-notice-content'>" + msg + "</div>";

			var container = yootil.create.container("An Error Has Occurred", html).show();

			container.appendTo("#content");
		},

		/**
		 * Handles gifting the money to the user if the gift code is valid and not already accepted.
		 *
		 * @returns {Boolean}
		 */

		gift_money: function(){
			var code = this.get_gift_code();
			var gift = this.valid_code(code);

			if(gift){
				if(!this.has_received(code) && this.allowed_gift(gift)){
					var html = "";
					var paid_where = (this.settings.paid_into == 1)? money.bank.settings.text.bank : money.settings.text.wallet;

					html += "<div class='monetary-gift-notice-icon'><img src='" + money.images.giftmoney + "' /></div>";
					html += "<div class='monetary-gift-notice-content'><div class='monetary-gift-notice-content-top'><p>You have recieved a gift of <strong>" + money.settings.money_symbol + yootil.html_encode(yootil.number_format(money.format(gift.amount))) + "</strong> that will be paid into your " + paid_where + ".</p>";

					if(gift.message.length){
						html += "<p>" + gift.message.replace(/\n/g, "<br />") + "</p>";
					}

					html+= "</div>";

					html += "<p class='monetary-gift-notice-content-accept'>Do you want to accept this gift?  <button>Yes</button></p></div><br style='clear: both' />";

					var container = yootil.create.container("You Have Received Some Money", html).show();
					var self = this;

					container.find("button").click(function(){
						if(self.collect_gift()){
							var msg = "";

							msg += "<p>You have successfully received a gift of <strong>" + money.settings.money_symbol + yootil.html_encode(yootil.number_format(money.format(gift.amount))) + "</strong>.</p>";
							msg += "<p>This has been paid into your " + paid_where + ".</p>";

							$(".monetary-gift-notice-content").html(msg);

							yootil.bar.remove("gift_" + gift.code);
						} else {
							pb.window.alert("An Error Occurred", "Could not collect gift.", {
								modal: true,
								resizable: false,
								draggable: false
							});
						}
					});

					container.appendTo("#content");

					return true;
				}
			}

			return false;
		},

		/**
		 * Gives the gift to the user.  This will update the wallet or bank depending on settings.
		 *
		 * @returns {Boolean}
		 */

		collect_gift: function(gift){
			if(this.current_code && this.lookup[this.current_code]){
				money.data(yootil.user.id()).push.gift(this.current_code);

				// Add money to wallet or bank

				var into_bank = false;
				var amount = this.lookup[this.current_code].amount || 0;

				if(!amount){
					return false;
				}

				if(this.settings.paid_into == 1){
					into_bank = true;
				}

				money.data(yootil.user.id()).increase[((into_bank)? "bank" : "money")](amount, true);

				if(into_bank){
					money.bank.create_transaction(8, amount, 0, true);
				}

				this.remove_old_codes();
				this.save_money_data();

				money.sync.trigger();

				return true;
			}

			return false;
		},

		/**
		 * Wrapper around user Data class update method to update the key.
		 */

		save_money_data: function(){
			money.data(yootil.user.id()).update();
		},

		/**
		 * Checks to see if the user is allowed this gift.  Various checks are done here against members and groups.
		 *
		 * @param {Object} gift The gift.
		 * @returns {Boolean}
		 */

		allowed_gift: function(gift){
			if(gift){

				// Check if this is for everyone

				if(!gift.members.length && !gift.groups.length){
					return true;
				} else {

					// Check members first, this overrides groups

					if($.inArrayLoose(yootil.user.id(), gift.members) > -1){
						return true;
					}

					// Now check the group

					var user_groups = yootil.user.group_ids();

					for(var g = 0, l = user_groups.length; g < l; g ++){
						if($.inArrayLoose(user_groups[g], gift.groups) > -1){
							return true;
						}
					}
				}
			}

			return false;
		},

		/**
		 * Checks to see if the user has already received the gift.
		 *
		 * @param {String} code The gift code.
		 * @returns {Boolean}
		 */

		has_received: function(code){
			if($.inArrayLoose(code, money.data(yootil.user.id()).get.gifts()) != -1){
				return true;
			}

			return false;
		},

		/**
		 * Gets the gift code from the URL.
		 *
		 * @returns {Mixed}
		 */

		get_gift_code: function(){
			var url = location.href;

			if(location.href.match(/\?monetarygift=(\w+)/i)){
				return RegExp.$1.toLowerCase();
			}

			return false;
		},

		/**
		 * Checks to make sure that the code is valid and exists in the lookup table.
		 *
		 * @returns {Mixed}
		 */

		valid_code: function(code){
			if(code){
				if(this.lookup[code]){
					this.current_code = code;

					return this.lookup[code];
				}
			}

			return false;
		},

		/**
		 * Handles removing old codes that do not exist to try and reduce the key length.
		 */

		remove_old_codes: function(){
			if(!this.settings.codes.length){
				money.data(yootil.user.id()).clear.gifts();

				return;
			}

			var gifts = money.data(yootil.user.id()).get.gifts();
			var len = gifts.length;

			while(len --){
				if(!this.lookup[gifts[len]]){
					gifts.splice(len, 1);
				}
			}

			money.data(yootil.user.id()).set.gifts(gifts);
		}

	};

})().register();