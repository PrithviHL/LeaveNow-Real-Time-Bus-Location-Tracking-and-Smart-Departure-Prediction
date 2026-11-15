import os
import streamlit as st
import pandas as pd
from geopy.distance import geodesic
from datetime import datetime, timedelta
import json
import requests

# Load the bus stop data from the JSON file
file_path = 'stops.json'  # Replace with your actual file path
try:
    bus_stops_data = pd.read_json(file_path)  # Use pd.read_csv if it's a CSV file
except Exception as e:
    st.error(f"Error loading bus stop data: {str(e)}")

# Function to calculate the nearest bus stop
def get_nearest_bus_stop(user_lat, user_lon, bus_stops_data):
    user_location = (user_lat, user_lon)
    nearest_stop = None
    min_distance = float('inf')  # Initialize with a large number

    # Iterate through each bus stop and calculate the distance
    for index, stop in bus_stops_data.iterrows():
        # Extract latitude and longitude from the dataset
        bus_stop_location = (stop['StopLat'], stop['StopLon'])

        # Calculate the distance between the user's location and the bus stop
        distance = geodesic(user_location, bus_stop_location).meters  # Calculate distance

        # Update the nearest bus stop if the current one is closer
        if distance < min_distance:
            min_distance = distance
            nearest_stop = stop  # Store the whole row (bus stop)

    return nearest_stop, min_distance

# Function to get bus stop details by name
def get_bus_stop_by_name(stop_name, bus_stops_data):
    matching_stops = bus_stops_data[bus_stops_data['StopName'].str.contains(stop_name, case=False, na=False)]
    if not matching_stops.empty:
        return matching_stops.iloc[0]  # Return the first matching bus stop
    return None

# Function to load the JSON data from the file
def load_json_data(file_path_stoparrivals):
    try:
        with open(file_path_stoparrivals, 'r') as file:
            return json.load(file)  # Load and return the data
    except Exception as e:
        st.error(f"Error loading bus arrival data: {str(e)}")
        return []

# Function to retrieve RouteID based on StopID
def get_route_id(stop_id, data):
    if isinstance(data, list):
        for stop in data:
            if isinstance(stop, dict) and 'StopID' in stop:
                if stop['StopID'] == stop_id:
                    return stop['RouteID']
        return "StopID not found"
    return "Invalid data format. Expected a list of dictionaries."

# Function to get the real-time bus arrival using the stopid
def get_bus_arrival(stop_id):
    url = "http://api.rgrta.com/rtpredictions"
    api_key = os.environ.get("RTS_API_KEY", "")
    params = {"key": api_key, "stopid": stop_id}

    try:
        rtpredictions = requests.get(url, params=params)
        rtpredictions.raise_for_status()  # Raises an HTTPError for bad responses
        data = rtpredictions.json()

        if isinstance(data, list) and len(data) > 0:
            bus_info = []
            for prediction in data:
                route_id = prediction.get("RouteId", None)
                eta_str = prediction.get("ETA", None)

                if route_id and eta_str:
                    try:
                        eta_time = datetime.strptime(eta_str, "%m/%d/%Y %I:%M:%S %p")
                        eta_time_formatted = eta_time.strftime("%Y-%m-%d %H:%M:%S")
                        bus_info.append({
                            "RouteId": route_id,
                            "RouteDir": prediction.get("RouteDir", "N/A"),
                            "Destination": prediction.get("DestinationSign", "N/A"),
                            "ETA": eta_time_formatted
                        })
                    except ValueError:
                        st.error("Error: Unable to parse the ETA time format.")
            return bus_info
        else:
            return "No bus predictions available for this stop."
    except requests.exceptions.RequestException as e:
        st.error(f"Error fetching real-time bus data: {str(e)}")
        return []

# Streamlit UI

st.title("LeaveNow")

# User input for latitude and longitude
user_lat = st.number_input("Enter your current latitude:", format="%.6f")
user_lon = st.number_input("Enter your current longitude:", format="%.6f")
destination_stop_name = st.text_input("Enter the destination bus stop name:")

# Add a submit button
if st.button("Submit"):
    try:
        # Find the nearest bus stop if inputs are provided
        if user_lat and user_lon:
            nearest_stop, distance = get_nearest_bus_stop(user_lat, user_lon, bus_stops_data)

            # Output the result for the nearest bus stop
            if nearest_stop is not None:
                st.write(f"Your nearest bus stop is {nearest_stop['StopName']} located at {nearest_stop['StopLat']}, {nearest_stop['StopLon']}.")
                st.write(f"Distance to nearest bus stop: {distance:.2f} meters.")
            else:
                st.write("No bus stops found.")

        # Find the destination bus stop details if the user provides a name
        if destination_stop_name:
            destination_stop = get_bus_stop_by_name(destination_stop_name, bus_stops_data)

            # Output the result for the destination bus stop
            if destination_stop is None:
                #st.write(f"Destination Bus Stop Details:")
                #st.write(f"Stop Name: {destination_stop['StopName']}")
                #st.write(f"Stop ID: {destination_stop['StopID']}")
                #st.write(f"Latitude: {destination_stop['StopLat']}")
                #st.write(f"Longitude: {destination_stop['StopLon']}")
            #else:
                st.write("Destination bus stop not found.")
                raise SystemExit

        # Load the stop data from the JSON file and fetch the real-time arrival times
        file_path_stoparrivals = 'stoparrivals.json'  # Replace with actual path
        stop_data = load_json_data(file_path_stoparrivals)

        if nearest_stop is not None:
            stop_id_input = nearest_stop['StopID']
            route_id_from_json = get_route_id(int(stop_id_input), stop_data)
            arrival_time_info = get_bus_arrival(stop_id_input)

            if isinstance(arrival_time_info, list):
                st.write(f"Bus arrival times for StopID {stop_id_input}:")
                for info in arrival_time_info:
                    st.write(f"RouteID: {info['RouteId']} | Direction: {info['RouteDir']} | Destination: {info['Destination']} | ETA: {info['ETA']}")
            else:
                st.write(arrival_time_info)

        # Function to calculate the walking time to the bus stop
        def calculate_walking_time(user_lat, user_lon, bus_stop_lat, bus_stop_lon):
            user_location = (user_lat, user_lon)
            bus_stop_location = (bus_stop_lat, bus_stop_lon)
            distance_meters = geodesic(user_location, bus_stop_location).meters
            walking_time_seconds = distance_meters / 1.39  # Average walking speed of 1.39 m/s
            walking_time_minutes = walking_time_seconds / 60
            return walking_time_minutes

        # Function to calculate the time to start walking
        def calculate_start_time(bus_eta, user_lat, user_lon, bus_stop_lat, bus_stop_lon, buffer_time_minutes=2.5):
            bus_eta_time = datetime.strptime(bus_eta, "%Y-%m-%d %H:%M:%S")
            walking_time = calculate_walking_time(user_lat, user_lon, bus_stop_lat, bus_stop_lon)
            start_time = bus_eta_time - timedelta(minutes=(walking_time + buffer_time_minutes))
            return start_time, walking_time

        # Calculate the bus arrival and walking time if inputs are provided
        if nearest_stop is not None:
            route_id_from_json = get_route_id(int(nearest_stop['StopID']), stop_data)
            arrival_time_info = get_bus_arrival(nearest_stop['StopID'])

            if isinstance(arrival_time_info, list):
                #st.write(f"Bus arrival times for StopID {nearest_stop['StopID']} (RouteID from JSON: {route_id_from_json}):")

                filtered_predictions = [info for info in arrival_time_info if info["RouteId"] == route_id_from_json]

                if filtered_predictions:
                    earliest_bus = min(filtered_predictions, key=lambda x: datetime.strptime(x['ETA'], "%Y-%m-%d %H:%M:%S"))
                    start_time, walking_time = calculate_start_time(earliest_bus['ETA'], user_lat, user_lon, nearest_stop['StopLat'], nearest_stop['StopLon'])
                    st.write(f"The earliest bus arrives at {earliest_bus['ETA']}.")
                    st.write(f"Your walking time to the bus stop is {walking_time:.2f} minutes.")
                    st.write(f"You should start walking at {start_time.strftime('%Y-%m-%d %H:%M:%S')} to reach the bus stop on time!")
                else:
                    st.write(f"No bus predictions found for RouteID {route_id_from_json}.")
            else:
                st.write(arrival_time_info)

    except Exception as e:
        st.error(f"An error occurred: {str(e)}")
