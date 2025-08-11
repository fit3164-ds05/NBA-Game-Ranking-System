

function DashboardHome() {
  return (
    <div className="w-screen overflow-x-hidden flex justify-center items-center min-h-screen p-6 bg-gray-100">
      <iframe
        title="FIBA Tableau Dashboard"
        src="https://public.tableau.com/views/FIBA3x3WorldCup2023Women/FIBA3x3WWCDashboard?:showVizHome=no&:embed=true"
        width="100%"
        height="900"
        allowFullScreen
      ></iframe>
    </div>
  );
}


export default DashboardHome;
