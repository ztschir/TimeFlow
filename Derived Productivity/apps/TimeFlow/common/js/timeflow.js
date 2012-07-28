var db;

jQuery(document).ready(function()
{
	db = window.openDatabase("TimeFlow", "1.0", "Derived Productivity", 200000);
	db.transaction(createDB, errorCB, load_buttons);
});

function createDB(tx)
{
    tx.executeSql('DROP TABLE IF EXISTS ENTRIES'); // need to comment this out when setting up for production
    tx.executeSql('CREATE TABLE IF NOT EXISTS ENTRIES (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, status, location, start_time, end_time)');
}

function errorCB(err)
{
    alert("Error processing SQL: "+err);
}

function successCB()
{
	
}

function load_buttons()
{
    jQuery.getJSON("locations.json",function(locations){
		locations = locations.locations;
		for(var i = 0; i < locations.length; i++)
		{
		    var p_char = 97 + (i % 3); 
		    jQuery("#main_view").append('<div class="ui-block-'+String.fromCharCode(p_char)+'"><a href="#'+locations[i].location+'" data-role="button" id="button_1" data-theme="c" class="ui-btn ui-btn-corner-all ui-shadow ui-btn-up-c"><span class="ui-btn-inner ui-btn-corner-all" aria-hidden="true"><span class="ui-btn-text">'+locations[i].location+'</span></span></a></div>');
		    create_page(locations[i].location);
		}
		jQuery(".check_in").click(function() {
			checkin(this);
		});
		jQuery(".checked_out").click(function(){
			checkout();
		});
		jQuery("#chart_button").click(function(){
			display_chart();
		});
    });
}

function display_check_out()
{
	jQuery("#main_view").css("display", "none");
	jQuery("#check_out_button").css("display", "inline");
}

function display_main_view()
{
	jQuery("#main_view").css("display", "inline");
	jQuery("#check_out_button").css("display", "none");
}

function checkout()
{
	db.transaction(add_check_out, errorCB, display_main_view);
	var end_time = Math.round((new Date()).getTime() / 1000);
	function add_check_out(tx)
	{
	    tx.executeSql('UPDATE ENTRIES SET end_time=? WHERE end_time=-1',[end_time]);
	}
}

function checkin(clicked_button)
{
    var location = jQuery(clicked_button).parent().parent().attr("id");
    jQuery("#check_in_loc").html("You've Checked-In to "+location);
    var status = jQuery(clicked_button).parent().parent().find('#textarea').val();
    var start_time = Math.round((new Date()).getTime() / 1000);


    if(navigator.geolocation)
    {
        navigator.geolocation.getCurrentPosition(display_loc,handle_errors);
    }
    
    db.transaction(add_check_in, errorCB, display_check_out);

    function display_loc(position)
    {
		console.log(location+"   -   Lat: "+position.coords.latitude+"   Long: "+position.coords.longitude);
    }

    function handle_errors(error)
    {
		switch(error.code)
		{
			case error.PERMISSION_DENIED: alert("user did not share geolocation data");
		            break;
		
			case error.POSITION_UNAVAILABLE: alert("could not detect current position");
		            break;
		
			case error.TIMEOUT: alert("retrieving position timed out");
		            break;
		
			default: alert("unknown error");
		            break;
		}
    }

    function add_check_in(tx)
    {
    	tx.executeSql('INSERT INTO ENTRIES (status, location, start_time, end_time) VALUES (?,?,?,?)', [status,location,start_time,-1]);
    	jQuery(".checked_out").html("Check out of "+location);
    }
}

function display_chart()
{
	jQuery("#chart").html("");
    db.transaction(load_chart_data, errorCB, successCB); 

    function load_chart_data(tx)
    {
    	tx.executeSql('SELECT * FROM ENTRIES',[],function(tx,results){
    		var len = results.rows.length, i;
    		for (i = 0; i < len; i++)
    		{
    			jQuery("#chart").append(results.rows.item(i).location+'<br/>');
    		}
    	});
    }
}

function create_page(page_name)
{
    jQuery("body").append('<div data-role="page" id="'+page_name+'">'+
    '<div data-role="header" data-add-back-btn="true">'+
                '<a href="#home" data-icon="home" data-iconpos="left" data-role="button" data-direction="reverse">Home</a>'+
        '<h1>'+page_name+'</h1>'+
        '</div>'+

    '<div data-role="content">'+

          '<div data-role="fieldcontain">'+
        '<label for="textarea">Status:</label>'+
            '<textarea class="textfield" cols="40" rows="8" name="textarea" id="textarea" placeholder="Type your status here"></textarea>'+
      '</div>'+

          '<div data-role="fieldcontain">'+
        '<fieldset data-role="controlgroup">'+
        '<label for="searchinput1">Location:</label>'+
           '<input id="searchinput1" placeholder="Search for location" value="" type="search" />'+
        '</fieldset>'+
      '</div>'+

          '<a href="#confirm" data-transition="slideup"  data-role="button" class="check_in">Check In</a>'+
    '</div></div>');
}