import { useEffect } from "react";

async function fetchWins() {
    const response = await fetch("/api/wins");
    const data = await response.json();
    return data;
}

const [city, setCity] = useState("Austin")
const [weather, setWeather] = useState(95);
useEffect(() => {
    fetch("/api/weather/" + city).then(res => res.json()).then(setWeather);
}, [city]);


useEffect(() => {
    setNow(Date());
}, [])

useEffect(() => {
    window.addEventListener('resize', handleResize);
    return window.removeEventListener('resize', handleResize);
}, [])