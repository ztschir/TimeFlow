var db;
var active_checkin;

jQuery(document).ready(function()
{
	db = window.openDatabase("TimeFlow", "1.0", "Derived Productivity", 200000);
	db.transaction(createDB, errorCB, load_buttons);
});

function createDB(tx)
{
    //tx.executeSql('DROP TABLE IF EXISTS ENTRIES'); // need to comment this out when setting up for production
    //tx.executeSql('DROP TABLE IF EXISTS ACTIVITIES'); // need to comment this out when setting up for production

    tx.executeSql('CREATE TABLE IF NOT EXISTS ENTRIES (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, status, location, start_time, end_time)');
    tx.executeSql('CREATE TABLE IF NOT EXISTS ACTIVITIES (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, name)');
    tx.executeSql('SELECT * FROM ACTIVITIES',[],function(tx,results) {
		if(results.rows.length == 0)
		{
	    	tx.executeSql('INSERT INTO ACTIVITIES (name) VALUES (?)', ["Sleep"]);
	    	tx.executeSql('INSERT INTO ACTIVITIES (name) VALUES (?)', ["Work"]);
	    	tx.executeSql('INSERT INTO ACTIVITIES (name) VALUES (?)', ["Fitness"]);
	    	tx.executeSql('INSERT INTO ACTIVITIES (name) VALUES (?)', ["Class"]);
	    	tx.executeSql('INSERT INTO ACTIVITIES (name) VALUES (?)', ["Study"]);
	    	tx.executeSql('INSERT INTO ACTIVITIES (name) VALUES (?)', ["TV"]);
	    	tx.executeSql('INSERT INTO ACTIVITIES (name) VALUES (?)', ["Leisure"]);
	    	//tx.executeSql('INSERT INTO ACTIVITIES (name) VALUES (?)', ["Custom1"]);
	    	//tx.executeSql('INSERT INTO ACTIVITIES (name) VALUES (?)', ["Custom2"]);
		}
    });
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
	db.transaction(load_activities, errorCB, successCB);
}

function reload_activity_buttons(tx)
{
	// delete all buttons and reload them
	jQuery("#main_view").html("");
	tx.executeSql('SELECT * FROM ACTIVITIES',[],function(tx,results) {
		for(var i = 0; i < results.rows.length; i++)
		{
			var p_char = 97 + (i % 3); 
		    create_button(results.rows.item(i).name,p_char);
		}
	});
}

function load_activities(tx)
{
	tx.executeSql('SELECT * FROM ACTIVITIES',[],function(tx,results) {
		for(var i = 0; i < results.rows.length; i++)
		{
			var p_char = 97 + (i % 3); 
		    create_button(results.rows.item(i).name,p_char);
		    create_page(results.rows.item(i).name);
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
		jQuery("#settings_button").click(function(){
			load_settings();
		});
		jQuery("#add_activity_button").click(function(){
			add_activity();
		});
		jQuery("#clear_check_in_button").click(function(){
			showConfirm();
			
		    function onConfirm(buttonIndex)
		    {
		    	if(buttonIndex == 1)
		        {
		        	clear_check_in_data();
		        }
		    }

		    function showConfirm() {
		        navigator.notification.confirm(
		            'Are you sure you want to clear user data?',  // message
		            onConfirm,              // callback to invoke with index of button pressed
		            'Clear User Data',            // title
		            'Yes,No'          // buttonLabels
		        );
		    }
		});
	});
}

function add_activity()
{
	var new_activity_name = jQuery("#add_activity_name").val();
	jQuery("#add_activity_name").val("");
	db.transaction(add_activity_to_db, errorCB, successCB);
	
	function add_activity_to_db(tx)
	{
		tx.executeSql('INSERT INTO ACTIVITIES (name) VALUES (?)', [new_activity_name]);
		create_activity_delete_button(new_activity_name);
		create_page(new_activity_name);
		jQuery(".check_in").unbind('click');
		jQuery(".check_in").click(function() {
			checkin(this);
		});
		db.transaction(reload_activity_buttons, errorCB, successCB);
		navigator.notification.alert(
	    	    'Added '+new_activity_name+' to list of activities.',  // message
	    	    function() {},         // callback
	    	    ' '            // title
	    	);
	}
}

function clear_check_in_data()
{
	db.transaction(clearEntriesDB, errorCB, successCB);
	function clearEntriesDB(tx)
	{
	    tx.executeSql('DROP TABLE IF EXISTS ENTRIES');
	    tx.executeSql('CREATE TABLE IF NOT EXISTS ENTRIES (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, status, location, start_time, end_time)');
	    navigator.notification.alert(
	    	    'Data Cleared!',  // message
	    	    function() {},         // callback
	    	    ' '            // title
	    	);
	}
};



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
		//console.log(location+"   -   Lat: "+position.coords.latitude+"   Long: "+position.coords.longitude);
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
    	active_checkin = location;
    }
}

function display_chart()
{
    db.transaction(load_chart_data, errorCB, successCB); 
    var data = new Array();;
    
    function load_chart_data(tx)
    {
    	tx.executeSql('SELECT * FROM ACTIVITIES',[],function(tx,results)
    	{
    		var len = results.rows.length, i, num=0;
    		for (i = 0; i < len; i++)
    		{
	    		tx.executeSql('SELECT SUM(start_time) AS start, SUM(end_time) AS end, location FROM ENTRIES WHERE location=?',[results.rows.item(i).name],function(tx,results)
	    		{
	    			if(results.rows.item(0).start != undefined)
	    			{
	    				if(results.rows.item(0).end != -1)
	    					data[num++] = new Array(results.rows.item(0).location,results.rows.item(0).end-results.rows.item(0).start);
	    				else
	    					data[num++] = new Array(results.rows.item(0).location,Math.round((new Date()).getTime() / 1000)-results.rows.item(0).start);
	    			}
	    		});
    		}
    		jQuery( '#timechart' ).live( 'pageshow',function(event, ui){
        		render_graph();
        	});
        	jQuery( '#timechart' ).live( 'pagebeforehide',function(event, ui){
        		derender_graph();
        	});
    	});
    }
    
    function render_graph()
    {
    	if(data.length){
          jQuery("#chart").html("");
    	  jQuery.jqplot.config.enablePlugins = true;
    	  plot7 = jQuery.jqplot('chart', 
    	    [data], 
    	    {
    	      title: ' ', 
    	      seriesDefaults: {shadow: true, renderer: jQuery.jqplot.PieRenderer, rendererOptions: { showDataLabels: true } }, 
    	      legend: { show:true }
    	    }
    	  );
    	}
    	else
    	  jQuery("#chart").html("No check ins have been made.");
    }

    function derender_graph()
    {
    	jQuery("#chart").html("");
    }
}

function create_button(button_name,p_char)
{
    jQuery("#main_view").append('<div class="ui-block-'+String.fromCharCode(p_char)+'"><a href="#'+button_name+'" data-role="button" id="button_1" data-theme="c" class="ui-btn ui-btn-corner-all ui-shadow ui-btn-up-c"><span class="ui-btn-inner ui-btn-corner-all" aria-hidden="true"><span class="ui-btn-text">'+button_name+'</span></span></a></div>');
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

function delete_page(page_name)
{
	jQuery("#page_name").remove();
}

function load_settings()
{
	jQuery("#delete_current_activities_list").html("");
    db.transaction(load_activities_db, errorCB, successCB);
	
	function load_activities_db(tx)
	{
		tx.executeSql('SELECT * FROM ACTIVITIES',[],function(tx,results) {
			for(var i = 0; i < results.rows.length; i++)
			{
				create_activity_delete_button(results.rows.item(i).name);
			}
			
		});
	}
}

function create_activity_delete_button(name)
{
	jQuery("#delete_current_activities_list").append('<li data-theme="c" id="delete_button_for_'+name+'" class="ui-btn ui-btn-icon-right ui-li ui-li-has-alt ui-btn-up-c">'+
        	'<div class="ui-btn-inner ui-li ui-li-has-alt" aria-hidden="true">'+
        		'<div class="ui-btn-text">'+
        			'<a href="#" class="ui-link-inherit">'+name+'</a>'+
        		'</div>'+
        	'</div>'+
        	'<a href="#" title="'+name+'" class="ui-li-link-alt ui-btn ui-btn-up-c delete_button" data-theme="c">'+
    	    	'<span class="ui-btn-inner" aria-hidden="true">'+
    	    		'<span class="ui-btn-text"></span>'+
    	    		'<span title="" data-theme="b" class="ui-btn ui-btn-up-b ui-btn-icon-notext ui-btn-corner-all ui-shadow">'+
    		    		'<span class="ui-btn-inner ui-btn-corner-all" aria-hidden="true">'+
    		    			'<span class="ui-btn-text"></span>'+
    		    			'<span class="ui-icon ui-icon-delete ui-icon-shadow"></span>'+
    		    			'</span>'+
    		    	'</span>'+
    		    '</span>'+
    	    '</a>'+
    	'</li>');
	jQuery(".delete_button").unbind('click');
	jQuery(".delete_button").click(function(){
		var page_name = jQuery(this).attr("title");
		delete_page(page_name);
		if(page_name == active_checkin) // we just deleted the activity we were checked into.
		{
			display_main_view();
		}
		db.transaction(delete_activity, errorCB, successCB);
		jQuery('#delete_button_for_'+page_name).remove();
		function delete_activity(tx){
			tx.executeSql('DELETE FROM ENTRIES WHERE location=?',[page_name]);
			tx.executeSql('DELETE FROM ACTIVITIES WHERE name=?',[page_name]);
			db.transaction(reload_activity_buttons, errorCB, successCB);
		}
	});
}